const ethers = require('ethers')
const fs = require('fs')
const { Sequelize, Op } = require('sequelize')
const models = require('./models/index.js')

const RPCS = {
  31337: {
    block: 0,
    url: 'http://localhost:8545'
  },
  43113: {
    block: 0,
    url: 'https://api.avax-test.network/ext/bc/C/rpc'
  },
  43114: {
    block: 14909991,
    url: 'https://api.avax.network/ext/bc/C/rpc'
  },
}

const CHAIN_ID = process.env.CHAIN_ID || 43114
const RPC = RPCS[CHAIN_ID]
const RPC_URL = process.env.RPC_URL || RPC.url
const MAX_BLOCKS = 2048
const NULL_ADDRESS = '0x0000000000000000000000000000000000000000'


function msToTime(duration) {
  var milliseconds = Math.floor((duration % 1000) / 100),
    seconds = Math.floor((duration / 1000) % 60),
    minutes = Math.floor((duration / (1000 * 60)) % 60),
    hours = Math.floor((duration / (1000 * 60 * 60)) % 24);

  hours = (hours < 10) ? "0" + hours : hours;
  minutes = (minutes < 10) ? "0" + minutes : minutes;
  seconds = (seconds < 10) ? "0" + seconds : seconds;

  return hours + ":" + minutes + ":" + seconds + "." + milliseconds;
}


class Event {
  constructor(id, type, blockNumber, blockTimestamp, transactionIndex, contractAddress, args) {
    this.id = id
    this.type = type
    this.blockNumber = blockNumber
    this.blockTimestamp = blockTimestamp
    this.transactionIndex = transactionIndex
    this.contractAddress = contractAddress
    this.args = args
  }

  static unserializeArgs(data) {
    let args = JSON.parse(data)
    for (let prop in args) {
      if (args[prop]._isBigNumber) {
        args[prop] = ethers.BigNumber.from(args[prop].data)
      }
    }
    return args
  }

  serializeArgs() {
    let args = {}
    for (let prop in this.args) {
      if (this.args[prop]._isBigNumber) {
        args[prop] = {
          _isBigNumber: true,
          data: this.args[prop].toString()
        }
      } else {
        args[prop] = this.args[prop]
      }
    }
    return JSON.stringify(args)
  }
}


class DB {
  async init(params) {
    this.db = new Sequelize(params)
    await this.db.authenticate()
    this.t = null
    this.enableTransactions = false
  }

  async startTransaction() {
    if (this.enableTransactions) {
      this.t = await this.db.transaction()
    }
  }

  async commitTransaction() {
    if (this.enableTransactions) {
      await this.t.commit()
    }
  }

  async rollbackTransaction() {
    if (this.enableTransactions) {
      await this.t.rollback()
    }
  }

  buildOpts() {
    const opts = {}
    if (this.t) opts.transaction = this.t
    return opts
  }

  async getCurrentBlock() {
    const block = await models.Block.findOne({ limit: 1, order: [['block', 'DESC']] })
    if (block) return block.block
    return null
  }

  async setCurrentBlock(block) {
    const inserted = await models.Block.create({ block })
    await models.Block.destroy({
      where: {
        block: {
          [Op.lt]: inserted.block
        }
      }
    }, this.buildOpts())
  }

  async upsertName(hash, params) {
    const name = await models.Name.findOne({
      where: {
        hash
      }
    }, this.buildOpts())
    if (name) {
      await name.update(params, this.buildOpts())
    } else {
      await models.Name.create({
        hash,
        ...params
      }, this.buildOpts())
    }
  }

  async upsertStandardEntry(name, hash, key, value, contractAddress) {
    const entry = await models.StandardEntry.findOne({
      where: {
        name,
        hash,
        key,
        contractAddress,
      }
    }, this.buildOpts())
    if (entry) {
      await entry.update({ value }, this.buildOpts())
    } else {
      await models.StandardEntry.create({
        name,
        hash,
        key,
        value,
        contractAddress
      }, this.buildOpts())
    }
  }

  async upsertEntry(name, hash, key, value, contractAddress) {
    const entry = await models.Entry.findOne({
      where: {
        name,
        hash,
        key,
        contractAddress,
      }
    }, this.buildOpts())
    if (entry) {
      await entry.update({ value }, this.buildOpts())
    } else {
      await models.Entry.create({
        name,
        hash,
        key,
        value,
        contractAddress,
      }, this.buildOpts())
    }
  }

  async upsertResolver(address) {
    let resolver = await models.Resolver.findOne({
      where: {
        address
      }
    }, this.buildOpts())
    if (!resolver) {
      resolver = await models.Resolver.create({
        address
      }, this.buildOpts())
    }
    return resolver.id
  }

  async getResolverAddresses() {
    const resolvers = await models.Resolver.findAll({}, this.buildOpts())
    return resolvers.map(resolver => resolver.address)
  }

  async getResolver(id) {
    return await models.Resolver.findOne({
      where: {
        id
      }
    }, this.buildOpts())
  }

  async getResolverReference(name, hash) {
    return await models.ResolverReference.findOne({
      where: {
        name,
        hash
      }
    }, this.buildOpts())
  }
  
  // Importantly, `resolver` is the return value from the
  // `upsertResolver` method.
  async setResolverReference(resolver, name, hash, datasetId) {
    let reference = await this.getResolverReference(name, hash)
    if (reference) {
      await reference.update({
        resolver,
        datasetId
      }, this.buildOpts())
    } else {
      await models.ResolverReference.create({
        name,
        hash,
        resolver,
        datasetId,
      }, this.buildOpts())
    }
    await models.Resolver
  }

  async deleteResolverReference(name, hash) {
    await models.ResolverReference.destroy({
      where: {
        name,
        hash
      }
    }, this.buildOpts())
  }

  async upsertReverseEntry(name, hash, key, target) {
    let entry = await models.ReverseEntry.findOne({
      name,
      hash,
      key
    }, this.buildOpts())
    
    if (entry) {
      await entry.update({ target }, this.buildOpts())
    } else {
      await models.ReverseEntry.create({
        name,
        hash,
        key,
        target
      }, this.buildOpts())
    }
  }

  async saveEvent(e) {
    const payload = {
      type: e.type,
      blockNumber: e.blockNumber,
      blockTimestamp: e.blockTimestamp,
      transactionIndex: e.transactionIndex,
      contractAddress: e.contractAddress,
      args: e.serializeArgs()
    }
    await models.Event.create(payload, this.buildOpts())
  }

  async getNextEvent() {
    const e = await models.Event.findOne({
      order: [
        ['blockNumber', 'ASC'],
        ['transactionIndex', 'ASC']
      ]
    }, this.buildOpts())
    if (!e) return null
    return new Event(
      e.id,
      e.type,
      e.blockNumber,
      e.blockTimestamp,
      e.transactionIndex,
      e.contractAddress,
      Event.unserializeArgs(e.args)
    )
  }

  async removeEvent(e) {
    await models.Event.destroy({
      where: {
        id: e.id
      }
    }, this.buildOpts())
  }
}


class Indexer {
  constructor(provider, avvy, db, dataSource) {
    this.provider = provider
    this.avvy = avvy
    this.db = db
    this.dataSource = dataSource
    this.timeoutWhenCaughtUp = 60
  }

  async executeDomainRegistration(e) {
    await this.db.upsertName(e.args.name.toString(), {
      owner: e.args.registrant,
      expiry: new Date((e.blockTimestamp + parseInt(e.args.leaseLength.toString())) * 1000)
    })
  }

  async executeDomainTransfer(e) {
    await this.db.upsertName(e.args.tokenId.toString(), {
      owner: e.args.to
    })
  }

  async executeRainbowTableReveal(e) {
    const hash = this.avvy.hash(e.args.hash)
    const name = await hash.lookup()
    await this.db.upsertName(e.args.hash.toString(), {
      name: name.name
    })
  }

  // Executing a ResolverSet event potentially
  // involves discovering a new Resolver address
  // which must be monitored for events. This
  // means we need to also check for events up
  // to the current block on the address that we
  // are adding.
  async executeResolverRegistryResolverSet(e) {
    if (e.args.resolver === NULL_ADDRESS) {
      await this.db.deleteResolverReference(e.args.name.toString(), e.args.hash.toString())
    } else {
      const resolverAddress = ethers.utils.getAddress(e.args.resolver)
      const resolver = await this.db.upsertResolver(resolverAddress)
      await this.db.setResolverReference(resolver, e.args.name.toString(), e.args.hash.toString(), e.args.datasetId.toString())
      const currentBlock = await this.db.getCurrentBlock() // this is the starting block in the next iteration
      const fromBlock = e.blockNumber + 1
      let toBlock = currentBlock - 1 // we want to process up to one block earlier than the next iteration
      let events
      if (toBlock < fromBlock) {
        events = []
      } else {
        events = await this.dataSource.getResolverEventsInRange(resolverAddress, fromBlock, toBlock)
      }
      for (let i = 0; i < events.length; i += 1) {
        await this.db.saveEvent(events[i])
      }
      await this.dataSource.addResolver(resolverAddress)
    }
  }

  async executeResolverEntrySet(e) {
    await this.db.upsertStandardEntry(e.args.name.toString(), e.args.hash.toString(), e.args.key.toString(), e.args.data.toString(), ethers.utils.getAddress(e.contractAddress))
  }

  async executeResolverStandardEntrySet(e) {
    await this.db.upsertEntry(e.args.name.toString(), e.args.hash.toString(), e.args.key.toString(), e.args.data.toString(), ethers.utils.getAddress(e.contractAddress))
  }

  async executeReverseResolverRegistryResolverSet(e) {
    // we're just going to pass on this for now.
  }

  async executeReverseResolverEVMEntrySet(e) {
    let hash = e.args.name
    for (let i = 0; i < e.args.path.length; i += 2) {
      hash = await preimageSignal2HashSignal([hash, e.args.path[i], e.args.path[i+1]])
    }
    await this.db.upsertReverseEntry(e.args.name.toString(), hash.toString(), 3, e.args.target)
  }

  async executeEvent(e) {
    switch (e.type) {
      case "Domain.Register":
        await this.executeDomainRegistration(e)
        break

      case "Domain.Transfer":
        await this.executeDomainTransfer(e)
        break

      case "RainbowTable.Reveal":
        await this.executeRainbowTableReveal(e)
        break

      case "ResolverRegistry.ResolverSet":
        await this.executeResolverRegistryResolverSet(e)
        break

      case "Resolver.StandardEntrySet":
        await this.executeResolverStandardEntrySet(e)
        break

      case "Resolver.EntrySet":
        await this.executeResolverEntrySet(e)
        break

      case "ReverseResolverRegistry.ResolverSet":
        await this.executeReverseResolverRegistryResolverSet(e)
        break

      case "ReverseResolver.EVMEntrySet":
        await this.executeReverseResolverEVMEntrySet(e)
        break

      default:
        throw "Unknown event type: " + e.type
    }
  }

  // Execute any unprocessed events which
  // have been stored in the database.
  async executeEvents() {
    while (true) {
      let e = await this.db.getNextEvent()
      if (!e) break
      await this.db.startTransaction()
      try {
        await this.executeEvent(e)
        await this.db.removeEvent(e)
        await this.db.commitTransaction()
      } catch (err) {
        await this.db.rollbackTransaction()
        console.log('execution err', err)
        process.exit(1)
      }
    }
  }

  // Given a set of events and a block which we 
  // have fetched data up until, we now attempt
  // to persist the events to the database &
  // then update the block number in the database.
  // If this fails, we roll back and retry for
  // the block range.
  //
  // This method returns true if successful.
  async saveEventsAndSetBlock(events, nextFromBlock) {
    await this.db.startTransaction()

    try {
      for (let i = 0; i < events.length; i += 1) {
        await this.db.saveEvent(events[i])
      }
      await this.db.setCurrentBlock(nextFromBlock)
      await this.db.commitTransaction()
    } catch (err) {
      console.log('err, rolling back')
      console.log(err)
      process.exit(0)
      await this.db.rollbackTransaction()
      return false
    }

    return true
  }

  async init() {
    const addresses = await this.db.getResolverAddresses()
    for (let i = 0; i < addresses.length; i += 1) {
      this.dataSource.addResolver(addresses[i])
    }
  }

  sleep(timeout) {
    return new Promise((resolve, reject) => {
      setTimeout(resolve, timeout)
    })
  }

  // This is the main loop for the indexer. This
  // method follows the following process:
  //
  // 1. Execute any unprocessed events that are
  //    saved in the database.
  //
  // 2. Fetch logs for the next range of blocks.
  //    If we are behind the current block, this
  //    means parsing a batch of a maximum size.
  //    Otherwise this means checking up until
  //    the current block.
  //
  // 3. Extract "Events" from the logs which were
  //    retrieved. Persist these Events to the
  //    database & update the next block.
  async run() {
    await this.init()

    let isCatchingUp = true
    let averageTimeToProcessRange = null
    let numIterations = 0

    while (true) {
      let loopStart = Date.now()
      await this.executeEvents()
      let fromBlock = await this.db.getCurrentBlock()
      let currBlock = await this.provider.getBlockNumber()
      while (fromBlock > currBlock) {
        await this.sleep(this.timeoutWhenCaughtUp)
        currBlock = await this.provider.getBlockNumber()
      }
      if (!fromBlock) fromBlock = RPC.block // this is the first block to parse, if we're starting over
      let toBlock = fromBlock + MAX_BLOCKS
      if (toBlock >= currBlock) {
        toBlock = currBlock
        isCatchingUp = false
      }
      let events = await this.dataSource.getEventsInRange(fromBlock, toBlock)
      await this.saveEventsAndSetBlock(events, toBlock + 1)

      // estimate time to sync
      if (isCatchingUp) {
        let loopLength = Date.now() - loopStart
        if (averageTimeToProcessRange) {
          averageTimeToProcessRange -= averageTimeToProcessRange / numIterations
          averageTimeToProcessRange += loopLength / numIterations
        } else {
          averageTimeToProcessRange = loopLength
        }
        let remainingIterations = (currBlock - toBlock) / MAX_BLOCKS
        let timeEstimateMillis = remainingIterations * averageTimeToProcessRange
        console.log(`
 Estimated time to sync: ${msToTime(timeEstimateMillis)}
 `)
      }
      numIterations += 1
    }
  }
}


class LogDataSource {
  constructor(provider, avvy) {
    this.provider = provider
    this.avvy = avvy
    this.blockCache = {}
    this.resolvers = {}
  }

  addResolver(resolverAddress) {
    this.resolvers[resolverAddress] = true
  }

  removeResolver(resolverAddress) {
    if (this.resolvers[resolverAddress]) {
      delete this.resolvers[resolverAddress]
    }
  }

  async getBlock(blockNumber) {
    if (!this.blockCache[blockNumber]) {
      this.blockCache[blockNumber] = await this.provider.getBlock(blockNumber)
    }
    return this.blockCache[blockNumber]
  }

  async clearBlockCache() {
    this.blockCache = {}
  }

  // get all events in the block range
  // from a specific topic
  async getEventsByFilter(params) {
    let logs = await this.provider.getLogs(params.filter)
    let results = []

    // get all the blocks cached
    let blockNumbers = []
    for (let i = 0; i < logs.length; i += 1) {
      if (blockNumbers.indexOf(logs[i].blockNumber) === -1) {
        blockNumbers.push(logs[i].blockNumber)
      }
    }
    await Promise.all(blockNumbers.map(num => this.getBlock(num)))

    for (let i = 0; i < logs.length; i += 1) {
      let block = await this.getBlock(logs[i].blockNumber)
      results.push(new Event(
        null, // no ID until we persist to db
        params.type,
        logs[i].blockNumber,
        block.timestamp,
        logs[i].transactionIndex,
        params.filter.address,
        params.iface.parseLog(logs[i]).args
      ))
    }
    return results
  }

  // get all resolver events in the block range
  async getResolverEventsInRange(address, fromBlock, toBlock) {
    const standardEntries = await this.getEventsByFilter({
      type: 'Resolver.StandardEntrySet',
      filter: {
        topics: [
          ethers.utils.id('StandardEntrySet(uint256,uint256,uint256[],uint256,string)'),
        ],
        address,
        fromBlock,
        toBlock,
      },
      iface: this.avvy.contracts.PublicResolverV1.interface
    })
    const entries = await this.getEventsByFilter({
      type: 'Resolver.EntrySet',
      filter: {
        topics: [
          ethers.utils.id('EntrySet(uint256,uint256,uint256[],string,string)'),
        ],
        address,
        fromBlock,
        toBlock,
      },
      iface: this.avvy.contracts.PublicResolverV1.interface
    })
    return standardEntries.concat(entries)
  }

  // get all events in the block range
  async getEventsInRange(fromBlock, toBlock) {
    console.log(``)
    console.log(`FETCHING BLOCK RANGE ${fromBlock} - ${toBlock}`)
    console.log(``)
    let params = [
      {
        type: 'Domain.Register',
        filter: { 
          topics: [
            ethers.utils.id('Register(address,address,uint256,uint256)')
          ], 
          address: this.avvy.contracts.Domain.address 
        },
        iface: this.avvy.contracts.Domain.interface
      },
      {
        type: 'Domain.Transfer',
        filter: {
          topics: [
            ethers.utils.id('Transfer(address,address,uint256)')
          ],
          address: this.avvy.contracts.Domain.address
        },
        iface: this.avvy.contracts.Domain.interface
      },
      {
        type: 'RainbowTable.Reveal',
        filter: {
          topics: [
            ethers.utils.id('Revealed(uint256)')
          ],
          address: this.avvy.contracts.RainbowTableV1.address
        },
        iface: this.avvy.contracts.RainbowTableV1.interface
      },
      {
        type: 'ResolverRegistry.ResolverSet',
        filter: {
          topics: [
            ethers.utils.id('ResolverSet(uint256,uint256,uint256[],address,uint256)')
          ],
          address: this.avvy.contracts.ResolverRegistryV1.address
        },
        iface: this.avvy.contracts.ResolverRegistryV1.interface
      },
      {
        type: 'ReverseResolverRegistry.ResolverSet',
        filter: {
          topics: [
            ethers.utils.id('ResolverSet(uint256,address)')
          ],
          address: this.avvy.contracts.ReverseResolverRegistryV1.address
        },
        iface: this.avvy.contracts.ReverseResolverRegistryV1.interface
      },
      {
        type: 'ReverseResolver.EVMEntrySet',
        filter: {
          topics: [
            ethers.utils.id('EntrySet(uint256,uint256[],address)')
          ],
          address: this.avvy.contracts.EVMReverseResolverV1.address
        },
        iface: this.avvy.contracts.EVMReverseResolverV1.interface
      }
    ]
    let events = []

    for (let i = 0; i < params.length; i += 1) {
      let param = params[i]
      param.filter.fromBlock = fromBlock
      param.filter.toBlock = toBlock
      let result = await this.getEventsByFilter(param)
      events = events.concat(result)
    }

    let resolverAddresses = Object.keys(this.resolvers)
    for (let i = 0; i < resolverAddresses.length; i += 1) {
      let result = await this.getResolverEventsInRange(resolverAddresses[i], fromBlock, toBlock)
      events = events.concat(result)
    }

    return events
  }
}

const main = async () => {
  const _AVVY = await import('@avvy/client')
  const AVVY = _AVVY.default
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL)
  const db = new DB()
  await db.init({
    dialect: 'sqlite',
  })
  const avvy = new AVVY(provider, {
    chainId: CHAIN_ID
  })
  const dataSource = new LogDataSource(provider, avvy, db)
  const indexer = new Indexer(provider, avvy, db, dataSource)
  await indexer.run()
}

main().then(() => process.exit(0)).catch(err => {
  console.log(err)
  process.exit(1)
})

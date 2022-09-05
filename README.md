# Introduction

This project is meant to help those who want to build off the Avvy Domains system, where they require the full state of the system or require a stream of system events.

# Installation

Installation instructions will be improved in the future. For now, the basic process is:

```bash
# set up the config file to connect to your
# data source. by default, we use an sqlite3
# database
cp config/config.example.json config/config.json

# install dependencies
npm install

# run database migrations
npm run migrate

# start the indexer
npm start
```

# Usage

You can connect to the sqlite database by running `sqlite3 db.sqlite`.

# Design

We have 4 primary components: `Event`, `Data Source`, `Indexer` and `Database`.

- `Events` are events that happen in the Avvy Domains system, such as a domain being registered or transferred to a new owner.
- The `Data Source` is responsible for interacting with the chain. It generates a stream of `Events` that need to be processed.
- The `Indexer` is the main component. It fetches `Events` from the `Data Source`, processes them, and updates the state of the system in the `Database`.

The `Database` and `Data Source` components can be swapped out for custom components. Integrators may wish to do this in situations where (a) they need to customize the way data is stored to support their application; or (b) they have an existing application which indexes the Avalanche C-Chain which they can pull information from in a custom way.

The default `Data Source` fetches event logs from the Avvy Domains contracts.

The default `Database` is a generic NodeJS SQL-ORM which can be connected to various SQL databases.

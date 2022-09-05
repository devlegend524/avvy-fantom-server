'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Event extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  Event.init({
    type: DataTypes.STRING,
    blockNumber: DataTypes.INTEGER,
    blockTimestamp: DataTypes.INTEGER,
    transactionIndex: DataTypes.INTEGER,
    contractAddress: DataTypes.STRING,
    args: DataTypes.STRING(100000)
  }, {
    sequelize,
    modelName: 'Event',
  });
  return Event;
};

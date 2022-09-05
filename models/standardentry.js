'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class StandardEntry extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  StandardEntry.init({
    contractAddress: DataTypes.STRING,
    name: DataTypes.STRING,
    hash: DataTypes.STRING,
    key: DataTypes.INTEGER,
    value: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'StandardEntry',
  });
  return StandardEntry;
};

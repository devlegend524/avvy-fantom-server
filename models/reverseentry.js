'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class ReverseEntry extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  ReverseEntry.init({
    name: DataTypes.STRING,
    hash: DataTypes.STRING,
    key: DataTypes.INTEGER,
    target: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'ReverseEntry',
  });
  return ReverseEntry;
};

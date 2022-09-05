'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Name extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  Name.init({
    hash: DataTypes.STRING,
    name: DataTypes.STRING,
    expiry: DataTypes.DATE,
    owner: DataTypes.STRING,
  }, {
    sequelize,
    modelName: 'Name',
  });
  return Name;
};

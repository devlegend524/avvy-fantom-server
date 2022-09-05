'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class ResolverReference extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  ResolverReference.init({
    name: DataTypes.STRING,
    hash: DataTypes.STRING,
    resolver: DataTypes.INTEGER,
    datasetId: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'ResolverReference',
  });
  return ResolverReference;
};

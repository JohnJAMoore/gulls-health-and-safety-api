import {DataTypes, Model, Sequelize} from 'sequelize';

/**
 * Local interface to hold the Condition.
 */
interface ConditionInterface {
  Id?: number;
  condition?: string;
  orderNumber?: number;
  default?: boolean;
}

/**
 * Build an Condition model.
 *
 * @param {Sequelize.Sequelize} sequelize A Sequelize connection.
 * @returns {Sequelize.Model} An Condition model.
 */
const ConditionModel = (sequelize: Sequelize) => {
  class Condition extends Model {
    public Id!: number;
    public condition!: string;
    public orderNumber!: number;
    public default!: boolean;
  }

  Condition.init(
    {
      Id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        validate: {
          notEmpty: true,
        },
      },
      condition: {
        type: DataTypes.STRING,
      },
      orderNumber: {
        type: DataTypes.INTEGER,
      },
      default: {
        type: DataTypes.BOOLEAN,
      },
    },
    {
      sequelize,
      modelName: 'Condition',
      timestamps: true,
      paranoid: true,
    },
  );

  return Condition;
};

export {ConditionModel as default};
export {ConditionInterface};

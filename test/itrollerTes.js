const {
  address,
  etherMantissa
} = require('../Utils/Ethereum');

const {
  makeComptroller,
  makePriceOracle
} = require('../Utils/Compound');

describe('Unitroller', () => {
  let root, accounts;
  let unitroller;
  let brains;
  let oracle;

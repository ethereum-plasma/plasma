pragma solidity ^0.4.18;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";
import "../contracts/PlasmaChainManager.sol";

contract TestPlasmaManager {
  function testTrue() public {
    Assert.equal(uint(1), uint(1), "plzzzz");
  }

  function testContractInitState() public {
    PlasmaChainManager plasma = PlasmaChainManager(DeployedAddresses.PlasmaChainManager());
    Assert.equal(plasma.lastBlockNumber(), uint(0), "lastBlockNumber should be initiated with 0");
    Assert.equal(plasma.txCounter(), uint(0), "txCounter should be initiated with 0");
  }
}

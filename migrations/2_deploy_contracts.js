const PlasmaChainManager = artifacts.require("./PlasmaChainManager");
const minHeapLib = artifacts.require("./MinHeapLib");
const arrayLib = artifacts.require("./ArrayLib");
const RLP = artifacts.require("./RLP");

module.exports = function(deployer) {
    deployer.deploy(minHeapLib);
    deployer.deploy(arrayLib);
    deployer.deploy(RLP);
    deployer.link(minHeapLib, PlasmaChainManager);
    deployer.link(arrayLib, PlasmaChainManager);
    deployer.link(RLP, PlasmaChainManager);
    deployer.deploy(PlasmaChainManager, 7 * 86400, 14 * 86400);
};

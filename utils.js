'use strict';

const Web3 = require("web3");

const addHexPrefix = (msg) => {
    return '0x' + msg;
};

const removeHexPrefix = (msg) => {
    if (Web3.utils.isHexStrict(msg)) {
        return msg.slice(2);
    } else {
        return msg;
    }
};

const bufferToHex = (buf, withPrefix) => {
    if (withPrefix) {
        return addHexPrefix(buf.toString('hex'));
    } else {
        return buf.toString('hex');
    }
};

const weiToEther = (data) => {
    return data / 1000000000000000000;
};

const etherToWei = (data) => {
    return data * 1000000000000000000;
};

module.exports = {addHexPrefix, removeHexPrefix, bufferToHex, weiToEther,
    etherToWei};

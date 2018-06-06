pragma solidity ^0.4.19;
import './RLP.sol';
import './MinHeapLib.sol';
import './ArrayLib.sol';

contract PlasmaChainManager {
    using ArrayLib for uint256[];
    using RLP for bytes;
    using RLP for RLP.RLPItem;
    using RLP for RLP.Iterator;
    using MinHeapLib for MinHeapLib.Heap;

    bytes constant PersonalMessagePrefixBytes = "\x19Ethereum Signed Message:\n96";
    uint32 constant blockHeaderLength = 161;

    uint256 exitAgeOffset;
    uint256 exitWaitOffset;

    struct BlockHeader {
        uint256 blockNumber;
        bytes32 previousHash;
        bytes32 merkleRoot;
        bytes32 r;
        bytes32 s;
        uint8 v;
        uint256 timeSubmitted;
    }

    struct DepositRecord {
        uint256 blockNumber;
        uint256 txIndex;
        address depositor;
        uint256 amount;
        uint256 timeCreated;
    }

    struct WithdrawRecord {
        uint256 blockNumber;
        uint256 txIndex;
        uint256 oIndex;
        address beneficiary;
        uint256 amount;
        uint256 priority;
    }

    address public owner;
    uint256 public lastBlockNumber;
    uint256 public txCounter;
    mapping(uint256 => BlockHeader) public headers;
    mapping(address => DepositRecord[]) public depositRecords;
    mapping(uint256 => uint256[]) public withdrawalIds;
    mapping(uint256 => WithdrawRecord) public withdrawRecords;
    MinHeapLib.Heap exits;

    function PlasmaChainManager(uint256 exitAge, uint256 exitWait) public {
        owner = msg.sender;
        lastBlockNumber = 0;
        txCounter = 0;
        exitAgeOffset = exitAge;
        exitWaitOffset = exitWait;
    }

    event HeaderSubmittedEvent(address signer, uint32 blockNumber);

    function submitBlockHeader(bytes header) public returns (bool success) {
        require(header.length == blockHeaderLength);

        bytes32 blockNumber;
        bytes32 previousHash;
        bytes32 merkleRoot;
        bytes32 sigR;
        bytes32 sigS;
        bytes1 sigV;
        assembly {
            let data := add(header, 0x20)
            blockNumber := mload(data)
            previousHash := mload(add(data, 32))
            merkleRoot := mload(add(data, 64))
            sigR := mload(add(data, 96))
            sigS := mload(add(data, 128))
            sigV := mload(add(data, 160))
            if lt(sigV, 27) { sigV := add(sigV, 27) }
        }

        // Check the block number.
        require(uint8(blockNumber) == lastBlockNumber + 1);

        // Check the signature.
        bytes32 blockHash = keccak256(PersonalMessagePrefixBytes, blockNumber,
            previousHash, merkleRoot);
        address signer = ecrecover(blockHash, uint8(sigV), sigR, sigS);
        require(msg.sender == signer);

        // Append the new header.
        BlockHeader memory newHeader = BlockHeader({
            blockNumber: uint8(blockNumber),
            previousHash: previousHash,
            merkleRoot: merkleRoot,
            r: sigR,
            s: sigS,
            v: uint8(sigV),
            timeSubmitted: now
        });
        headers[uint8(blockNumber)] = newHeader;

        // Increment the block number by 1 and reset the transaction counter.
        lastBlockNumber += 1;
        txCounter = 0;

        HeaderSubmittedEvent(signer, uint8(blockNumber));
        return true;
    }

    event DepositEvent(address from, uint256 amount,
        uint256 indexed blockNumber, uint256 txIndex);

    function deposit() payable public returns (bool success) {
        DepositRecord memory newDeposit = DepositRecord({
            blockNumber: lastBlockNumber,
            txIndex: txCounter,
            depositor: msg.sender,
            amount: msg.value,
            timeCreated: now
        });
        depositRecords[msg.sender].push(newDeposit);
        txCounter += 1;
        DepositEvent(msg.sender, msg.value, newDeposit.blockNumber,
            newDeposit.txIndex);
        return true;
    }

    event WithdrawalStartedEvent(uint256 withdrawalId);

    function startWithdrawal(
        uint256 blockNumber,
        uint256 txIndex,
        uint256 oIndex,
        bytes targetTx,
        bytes proof
    )
        public
        returns (uint256 withdrawalId)
    {
        BlockHeader memory header = headers[blockNumber];
        require(header.blockNumber > 0);

        var txList = targetTx.toRLPItem().toList();
        require(txList.length == 13);

        // Check if the target transaction is in the block.
        require(isValidProof(header.merkleRoot, targetTx, proof));

        // Check if the transaction owner is the sender.
        address txOwner = txList[6 + 2 * oIndex].toAddress();
        require(txOwner == msg.sender);

        // Generate a new withdrawal ID.
        uint256 priority = max(header.timeSubmitted, now - exitAgeOffset);
        withdrawalId = blockNumber * 1000000 + txIndex * 1000 + oIndex;
        WithdrawRecord storage record = withdrawRecords[withdrawalId];
        require(record.blockNumber == 0);

        // Construct a new withdrawal.
        record.blockNumber = blockNumber;
        record.txIndex = txIndex;
        record.oIndex = oIndex;
        record.beneficiary = txOwner;
        record.amount = txList[7 + 2 * oIndex].toUint();
        record.priority = priority;

        exits.add(priority);
        withdrawalIds[priority].push(withdrawalId);

        WithdrawalStartedEvent(withdrawalId);
        return withdrawalId;
    }

    event WithdrawalChallengedEvent(uint256 withdrawalId);

    function challengeWithdrawal(
        uint256 withdrawalId,
        uint256 blockNumber,
        uint256 txIndex,
        uint256 oIndex,
        bytes targetTx,
        bytes proof
    )
        public
        returns (bool success)
    {
        BlockHeader memory header = headers[blockNumber];
        require(header.blockNumber > 0);

        var txList = targetTx.toRLPItem().toList();
        require(txList.length == 13);

        // Check if the transaction is in the block.
        require(isValidProof(header.merkleRoot, targetTx, proof));

        // Check if the withdrawal exists.
        WithdrawRecord memory record = withdrawRecords[withdrawalId];
        require(record.blockNumber > 0);

        // The transaction spends the given withdrawal on plasma chain.
        if (isWithdrawalSpent(targetTx, record)) {
            withdrawalIds[record.priority].remove(withdrawalId);
            delete withdrawRecords[withdrawalId];

            WithdrawalChallengedEvent(withdrawalId);
            return true;
        }

        return false;
    }

    event WithdrawalCompleteEvent(uint256 indexed blockNumber,
        uint256 exitBlockNumber, uint256 exitTxIndex, uint256 exitOIndex);

    function finalizeWithdrawal() public returns (bool success) {
        while (!exits.isEmpty() && now > exits.peek() + exitWaitOffset) {
            uint256 priority = exits.pop();
            for (uint256 i = 0; i < withdrawalIds[priority].length; i++) {
                uint256 index = withdrawalIds[priority][i];
                WithdrawRecord memory record = withdrawRecords[index];
                record.beneficiary.transfer(record.amount);

                WithdrawalCompleteEvent(lastBlockNumber, record.blockNumber,
                    record.txIndex, record.oIndex);
                delete withdrawRecords[index];
            }
            delete withdrawalIds[priority];
        }
        return true;
    }

    function isValidProof(bytes32 root, bytes target, bytes proof)
        pure
        internal
        returns (bool valid)
    {
        bytes32 hash = keccak256(target);
        for (uint i = 32; i < proof.length; i += 33) {
            bytes1 flag;
            bytes32 sibling;
            assembly {
                flag := mload(add(proof, i))
                sibling := mload(add(add(proof, i), 1))
            }
            if (flag == 0) {
                hash = keccak256(sibling, hash);
            } else if (flag == 1) {
                hash = keccak256(hash, sibling);
            }
        }
        return hash == root;
    }

    function max(uint256 a, uint256 b) pure internal returns (uint256 result) {
        return (a > b) ? a : b;
    }

    function isWithdrawalSpent(bytes targetTx, WithdrawRecord record)
        view
        internal
        returns (bool spent)
    {
        var txList = targetTx.toRLPItem().toList();
        require(txList.length == 13);

        // Check two inputs individually if it spent the given withdrawal.
        for (uint256 i = 0; i < 2; i++) {
            if (!txList[3 * i].isEmpty()) {
                uint256 blockNumber = txList[3 * i].toUint();
                // RLP will encode integer 0 to 0x80 just like empty content...
                uint256 txIndex = txList[3 * i + 1].isEmpty() ? 0 : txList[3 * i + 1].toUint();
                uint256 oIndex = txList[3 * i + 2].isEmpty() ? 0 : txList[3 * i + 2].toUint();
                if (record.blockNumber == blockNumber &&
                    record.txIndex == txIndex &&
                    record.oIndex == oIndex) {
                    return true;
                }
            }
        }
        return false;
    }
}

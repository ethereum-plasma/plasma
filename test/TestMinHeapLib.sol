pragma solidity ^0.4.18;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";
import "../contracts/MinHeapLib.sol";

contract TestMinHeapLib {
  using MinHeapLib for MinHeapLib.Heap;

  MinHeapLib.Heap heap;

  function initHeap() internal {
    heap.data.length = 0;
  }

  function testAdd() public {
    initHeap();
    heap.add(5);
    heap.add(3);
    heap.add(4);
    heap.add(1);
    heap.add(2);
    Assert.equal(heap.data[0], uint(1), "top of heap data should be 1");
    Assert.equal(heap.data.length, uint(5), "heap should have 5 elements");
  }

  function testPeek() public {
    initHeap();
    heap.data = [1, 2, 3];

    Assert.equal(heap.peek(), uint(1), "heap.peek() should be 1");
  }

  function testPop() public {
    initHeap();
    heap.data = [1, 2, 3];

    Assert.equal(heap.pop(), uint(1), "should pop 1");
    Assert.equal(heap.pop(), uint(2), "should pop 2");
    Assert.equal(heap.pop(), uint(3), "should pop 3");
    Assert.isTrue(heap.isEmpty(), "heap should be empty");
  }

  function testSimpleIntegration() public {
    initHeap();
    uint TEST_NUM = 10;
    uint i;

    for(i = TEST_NUM ; i > 0 ; i--) {
      heap.add(i);
      Assert.equal(heap.peek(), i, "should have correct peek while adding");
    }

    for(i = 1 ; i <= TEST_NUM ; i++) {
      Assert.equal(heap.pop(), i, "should pop correctly");
    }

    Assert.isTrue(heap.isEmpty(), "heap should be empty");
  }
}

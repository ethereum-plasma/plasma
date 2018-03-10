pragma solidity ^0.4.19;

library MinHeapLib {
    struct Heap {
        uint256[] data;
    }

    function add(Heap storage _heap, uint256 value) internal {
        uint index = _heap.data.length;
        _heap.data.length += 1;
        _heap.data[index] = value;

        // Fix the min heap if it is violated.
        while (index != 0 && _heap.data[index] < _heap.data[(index - 1) / 2]) {
            uint256 temp = _heap.data[index];
            _heap.data[index] = _heap.data[(index - 1) / 2];
            _heap.data[(index - 1) / 2] = temp;
            index = (index - 1) / 2;
        }
    }

    function peek(Heap storage _heap) view internal returns (uint256 value) {
        require(_heap.data.length > 0);
        return _heap.data[0];
    }

    function pop(Heap storage _heap) internal returns (uint256 value) {
        require(_heap.data.length > 0);
        uint256 root = _heap.data[0];
        _heap.data[0] = _heap.data[_heap.data.length - 1];
        _heap.data.length -= 1;
        heapify(_heap, 0);
        return root;
    }

    function heapify(Heap storage _heap, uint i) internal {
        uint left = 2 * i + 1;
        uint right = 2 * i + 2;
        uint smallest = i;
        if (left < _heap.data.length && _heap.data[left] < _heap.data[i]) {
            smallest = left;
        }
        if (right < _heap.data.length && _heap.data[right] < _heap.data[smallest]) {
            smallest = right;
        }
        if (smallest != i) {
            uint256 temp = _heap.data[i];
            _heap.data[i] = _heap.data[smallest];
            _heap.data[smallest] = temp;
            heapify(_heap, smallest);
        }
    }

    function isEmpty(Heap storage _heap) view internal returns (bool empty) {
        return _heap.data.length == 0;
    }
}

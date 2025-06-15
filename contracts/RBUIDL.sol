// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";


contract rRWA is ERC20 {
    address public immutable minter;
    
    constructor() ERC20("Wrapped RWA", "rRWA") {
        minter = msg.sender;
    }
    
    function mint(address to, uint256 amount) external {
        require(msg.sender == minter, "Only minter");
        _mint(to, amount);
    }
}
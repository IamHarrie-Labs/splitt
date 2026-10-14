// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
contract MockUSDC is ERC20 {
    mapping(address => bool) public blocked;
    constructor() ERC20("Mock USDC", "USDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function blockAddress(address addr, bool value) external { blocked[addr] = value; }
    function _update(address from, address to, uint256 amount) internal override {
        require(!blocked[to], "BLOCKLISTED"); super._update(from, to, amount);
    }
}

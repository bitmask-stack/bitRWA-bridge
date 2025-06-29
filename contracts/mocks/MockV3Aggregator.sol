// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AggregatorV3Interface } from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract MockV3Aggregator is AggregatorV3Interface {
    int256 public answer;
    uint8 public decimalsValue;

    constructor(int256 _answer, uint8 _decimals) {
        answer = _answer;
        decimalsValue = _decimals;
    }

    function decimals() external view override returns (uint8) {
        return decimalsValue;
    }

    function description() external view override returns (string memory) {
        return "Mock ETH/USD Price Feed";
    }

    function version() external view override returns (uint256) {
        return 1;
    }

    function getRoundData(uint80 _roundId) external view override returns (
        uint80 roundId,
        int256 answer_,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        return (_roundId, answer, block.timestamp, block.timestamp, _roundId);
    }

    function latestRoundData() external view override returns (
        uint80 roundId,
        int256 answer_,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        return (1, answer, block.timestamp, block.timestamp, 1);
    }

    function updateAnswer(int256 newAnswer) public {
        answer = newAnswer;
    }
}
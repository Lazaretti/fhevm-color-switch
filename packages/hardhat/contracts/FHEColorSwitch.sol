// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint32, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title FHEColorSwitch
 * @notice Simple encrypted score tracker for Color Switch game using FHE.
 *         Players submit encrypted scores; all data remains encrypted on-chain.
 */
contract FHEColorSwitch is SepoliaConfig {
    /// @dev Mapping: player's address => list of encrypted scores
    mapping(address => euint32[]) private _playerScores;

    /// @notice Add a new encrypted score
    /// @param cipherScore Score in externalFHE format
    /// @param validationProof Proof to convert external -> internal FHE
    function addEncryptedScore(externalEuint32 cipherScore, bytes calldata validationProof) external {
        euint32 internalScore = FHE.fromExternal(cipherScore, validationProof);
        FHE.allowThis(internalScore);

        _playerScores[msg.sender].push(internalScore);

        FHE.allow(internalScore, msg.sender);
    }

    /// @notice Retrieve encrypted score history of a player
    /// @param user Address of the player
    /// @return Array of encrypted scores
    function viewEncryptedScores(address user) external view returns (euint32[] memory) {
        return _playerScores[user];
    }

    /// @notice Get the number of scores submitted by a player
    /// @param user Address of the player
    /// @return Count of encrypted scores
    function totalScores(address user) external view returns (uint256) {
        return _playerScores[user].length;
    }

    /// @notice Get the last submitted encrypted score of a player
    /// @param user Address of the player
    /// @return The last encrypted score (ciphertext)
    function lastScore(address user) external view returns (euint32) {
        uint256 len = _playerScores[user].length;
        require(len > 0, "No scores recorded");
        return _playerScores[user][len - 1];
    }
}

import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FHEColorSwitch, FHEColorSwitch__factory } from "../types";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Players = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployColorSwitch() {
  const factory = (await ethers.getContractFactory("FHEColorSwitch")) as FHEColorSwitch__factory;
  const contract = (await factory.deploy()) as FHEColorSwitch;
  const address = await contract.getAddress();
  return { contract, address };
}

describe("🎮 FHEColorSwitch — Encrypted Score Tracking", function () {
  let users: Players;
  let colorSwitch: FHEColorSwitch;
  let colorSwitchAddr: string;

  before(async () => {
    const [deployer, a1, a2] = await ethers.getSigners();
    users = { deployer, alice: a1, bob: a2 };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("⚠️ Requires local FHEVM mock for testing encrypted logic");
      this.skip();
    }
    ({ contract: colorSwitch, address: colorSwitchAddr } = await deployColorSwitch());
  });

  it("starts with no score records for a new player", async () => {
    const count = await colorSwitch.totalScores(users.alice.address);
    expect(count).to.equal(0);
  });

  it("allows a player to submit a single encrypted score and decrypt correctly", async () => {
    const encrypted = await fhevm.createEncryptedInput(colorSwitchAddr, users.alice.address).add32(25).encrypt();

    const tx = await colorSwitch.connect(users.alice).addEncryptedScore(encrypted.handles[0], encrypted.inputProof);
    await tx.wait();

    const scores = await colorSwitch.viewEncryptedScores(users.alice.address);
    expect(scores.length).to.equal(1);

    const plain = await fhevm.userDecryptEuint(FhevmType.euint32, scores[0], colorSwitchAddr, users.alice);
    expect(plain).to.equal(25);
  });

  it("records multiple scores in the correct sequence", async () => {
    const dataset = [10, 20, 30, 15];
    for (const score of dataset) {
      const encrypted = await fhevm.createEncryptedInput(colorSwitchAddr, users.alice.address).add32(score).encrypt();
      await (
        await colorSwitch.connect(users.alice).addEncryptedScore(encrypted.handles[0], encrypted.inputProof)
      ).wait();
    }

    const scores = await colorSwitch.viewEncryptedScores(users.alice.address);
    expect(scores.length).to.eq(dataset.length);

    for (let i = 0; i < dataset.length; i++) {
      const val = await fhevm.userDecryptEuint(FhevmType.euint32, scores[i], colorSwitchAddr, users.alice);
      expect(val).to.eq(dataset[i]);
    }
  });

  it("keeps each player's encrypted scores isolated and private", async () => {
    const encAlice = await fhevm.createEncryptedInput(colorSwitchAddr, users.alice.address).add32(42).encrypt();
    await colorSwitch.connect(users.alice).addEncryptedScore(encAlice.handles[0], encAlice.inputProof);

    const encBob = await fhevm.createEncryptedInput(colorSwitchAddr, users.bob.address).add32(99).encrypt();
    await colorSwitch.connect(users.bob).addEncryptedScore(encBob.handles[0], encBob.inputProof);

    const listAlice = await colorSwitch.viewEncryptedScores(users.alice.address);
    const listBob = await colorSwitch.viewEncryptedScores(users.bob.address);

    const decAlice = await fhevm.userDecryptEuint(FhevmType.euint32, listAlice[0], colorSwitchAddr, users.alice);
    const decBob = await fhevm.userDecryptEuint(FhevmType.euint32, listBob[0], colorSwitchAddr, users.bob);

    expect(decAlice).to.eq(42);
    expect(decBob).to.eq(99);
  });

  it("can handle repeated identical encrypted score submissions", async () => {
    const repeated = [7, 7, 7];
    for (const s of repeated) {
      const enc = await fhevm.createEncryptedInput(colorSwitchAddr, users.alice.address).add32(s).encrypt();
      await (await colorSwitch.connect(users.alice).addEncryptedScore(enc.handles[0], enc.inputProof)).wait();
    }

    const stored = await colorSwitch.viewEncryptedScores(users.alice.address);
    expect(stored.length).to.eq(repeated.length);

    for (const item of stored) {
      const val = await fhevm.userDecryptEuint(FhevmType.euint32, item, colorSwitchAddr, users.alice);
      expect(val).to.eq(7);
    }
  });

  it("supports large uint32 values as valid encrypted scores", async () => {
    const max = 2 ** 32 - 10;
    const enc = await fhevm.createEncryptedInput(colorSwitchAddr, users.alice.address).add32(max).encrypt();
    await (await colorSwitch.connect(users.alice).addEncryptedScore(enc.handles[0], enc.inputProof)).wait();

    const last = await colorSwitch.lastScore(users.alice.address);
    const decrypted = await fhevm.userDecryptEuint(FhevmType.euint32, last, colorSwitchAddr, users.alice);
    expect(decrypted).to.eq(max);
  });

  it("accurately returns the most recently submitted score", async () => {
    const values = [1, 5, 10];
    for (const s of values) {
      const enc = await fhevm.createEncryptedInput(colorSwitchAddr, users.alice.address).add32(s).encrypt();
      await (await colorSwitch.connect(users.alice).addEncryptedScore(enc.handles[0], enc.inputProof)).wait();
    }

    const latestCipher = await colorSwitch.lastScore(users.alice.address);
    const latestPlain = await fhevm.userDecryptEuint(FhevmType.euint32, latestCipher, colorSwitchAddr, users.alice);
    expect(latestPlain).to.eq(values[values.length - 1]);
  });

  it("handles rapid consecutive encrypted submissions without reverting", async () => {
    const burst = [3, 6, 9, 12];
    for (const s of burst) {
      const enc = await fhevm.createEncryptedInput(colorSwitchAddr, users.alice.address).add32(s).encrypt();
      await colorSwitch.connect(users.alice).addEncryptedScore(enc.handles[0], enc.inputProof);
    }

    const history = await colorSwitch.totalScores(users.alice.address);
    expect(history).to.eq(burst.length);
  });
});

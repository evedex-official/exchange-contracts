import { Address } from "viem";

// contract addresses initially deployed on clean node, replace if needed
import OrderValidationLibJson from "../../../artifacts/contracts/lib/OrderValidationLib.sol/OrderValidationLib.json";
import SessionManagerJson from "../../../artifacts/contracts/session/SessionManager.sol/SessionManager.json";
import EveVaultJson from "../../../artifacts/contracts/vault/EveVault.sol/EveVault.json";
import EveDexJson from "../../../artifacts/contracts/EVEDEX.sol/EVEDEX.json";
import DepositDexJson from "../../../artifacts/contracts/DepositDEX.sol/DepositDEX.json";
import UsdtJson from "../../../artifacts/contracts/mock/ERC20MockDecimals.sol/ERC20MockDecimals.json";
import BtcJson from "../../../artifacts/contracts/mock/ERC20MockDecimals.sol/ERC20MockDecimals.json";

export const OrderValidationLib = {
  address: "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address,
  abi: OrderValidationLibJson.abi,
};

export const SessionManager = {
  address: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512" as Address,
  abi: SessionManagerJson.abi,
};

export const EveVault = {
  address: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0" as Address,
  abi: EveVaultJson.abi,
};

export const EveDEX = {
  address: "0x0165878A594ca255338adfa4d48449f69242Eb8F" as Address,
  abi: EveDexJson.abi,
};

export const DepositDEX = {
  address: "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9" as Address,
  abi: DepositDexJson.abi,
};

export const Usdt = {
  address: "0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e" as Address,
  abi: UsdtJson.abi,
};

export const Btc = {
  address: "0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0" as Address,
  abi: BtcJson.abi,
};

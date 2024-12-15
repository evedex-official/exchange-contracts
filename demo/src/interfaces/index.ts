import { Address, AbiItem, Hash } from "viem";

export type ContractConfig = {
  address: Address;
  abi: AbiItem[];
};

export type CallConfig = {
  functionName: string;
  format?: (value: any) => any;
  key: string;
  args?: any[];
  defaultValue?: any;
};

export type WithdrawalRequest = {
  collateral: Address;
  account: Address;
  amount: bigint;
  session: Address;
  expiration: number;
  signature: Hash;
};

export type Order = {
  senderAddress: Address;
  matcherAddress: Address;
  collateral: Address;
  instrumentIndex: number;
  amount: bigint;
  price: bigint;
  leverage: bigint;
  matcherFee: bigint;
  expiration: number;
  side: number;
  userSession: Address;
  merkleRoot: Hash;
  merkleProof: Hash[];
  signature: Hash;
};

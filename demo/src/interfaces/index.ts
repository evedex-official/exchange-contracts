import { Address, AbiItem } from "viem";

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

export type WithdrawalRequest = {};

export type Order = {};

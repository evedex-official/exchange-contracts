import { Address, Hash } from "viem";

export type WithdrawalRequest = {
  collateral: Address;
  account: Address;
  amount: bigint;
  session: Address;
  expiration: number;
  signature: Hash;
};

export enum RequestStatus {
  NotCreated,
  Open,
  Cancelled,
  Completed,
}

export type WithdrawalRequestContract = {
  timestamp: number;
  status: RequestStatus;
};

export type WithdrawalRequestExtended = WithdrawalRequest &
  WithdrawalRequestContract & {
    hash: Hash;
  };

export type Order = {
  orderId: number;
  senderAddress: Address;
  matcherAddress: Address;
  collateral: Address;
  instrumentIndex: number;
  amount: bigint;
  price: bigint;
  leverage: bigint;
  matcherFee: bigint;
  creationTime: number;
  side: number;
  userSession: Address;
  merkleRoot: Hash;
  merkleProof: Hash[];
  signature: Hash;
};

export type OrderExtended = {
  collateralIndex: number;
  order: Order;
};

export type Instrument = {
  ticker: string;
  leverage: number;
};

export type Token = {
  symbol: string;
  decimals: number;
  address: Address;
  name: string;
};

export type InstrumentExtended = Instrument & {
  index: number;
  token: Token;
};

export type Collateral = Token & {
  index: number;
};

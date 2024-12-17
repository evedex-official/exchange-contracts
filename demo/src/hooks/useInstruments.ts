import { useReadContract, useReadContracts } from "wagmi";
import { Address } from "viem";

import { Btc, EveDEX, Usdt } from "../contracts";
import { convertCallsResult, getContractCalls } from "../helpers";
import {
  Instrument,
  InstrumentExtended,
  Token,
} from "../helpers/event-horizon-types";

const contractConfig = {
  abi: EveDEX.abi,
  address: EveDEX.address,
};

const instrumentsConfig: {
  [x: string]: { token0: Token; token1: Token; priceToken: Address };
} = {
  "BTC/USD": {
    token0: {
      address: Btc.address,
      symbol: "BTC",
      decimals: 18,
    },
    token1: {
      address: Usdt.address,
      symbol: "USDT",
      decimals: 6,
    },
    priceToken: Btc.address,
  },
};

const useInstruments = () => {
  const {
    data: instrumentsLengthData,
    isLoading: isLoadingInstrumentsLength,
  } = useReadContract({
    ...contractConfig,
    functionName: "instrumentsLength",
  });

  const instrumentsLength: number = instrumentsLengthData || 0;

  const calls = [];

  for (let i = 0; i < instrumentsLength; i++) {
    calls.push({
      key: i.toString(),
      functionName: "getInstrumentData",
      args: [i],
    });
  }

  const contractCalls = getContractCalls(calls, contractConfig);

  const { data, isLoading } = useReadContracts({
    contracts: contractCalls,
    query: {
      enabled: instrumentsLength > 0,
    },
  });

  const instruments = convertCallsResult(calls, data) as {
    [x: number]: Instrument;
  };

  const instrumentsExtended: InstrumentExtended[] = [];

  Object.entries(instruments).forEach(([key, value]) => {
    instrumentsExtended.push({
      index: parseInt(key),
      ...value,
      ...instrumentsConfig[value.ticker],
    });
  });

  return {
    instruments: instrumentsExtended,
    isLoading: isLoading || isLoadingInstrumentsLength,
  };
};

export default useInstruments;

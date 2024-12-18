import { useReadContracts } from "wagmi";

import { Btc, EveDEX } from "../contracts";
import { convertCallsResult, getContractCalls } from "../helpers";
import {
  Instrument,
  InstrumentExtended,
  Token,
} from "../helpers/event-horizon-types";
import useEveDex from "./useEveDex";
import usePrices from "./usePrices";

const contractConfig = {
  abi: EveDEX.abi,
  address: EveDEX.address,
};

const instrumentsConfig: {
  [x: string]: { token: Token };
} = {
  "BTC/USD": {
    token: {
      address: Btc.address,
      symbol: "BTC",
      decimals: 18,
      name: "Bitcoin",
    },
  },
};

const useInstruments = () => {
  const { data: eveDex, isLoading: isLoadingEveDex } = useEveDex();

  const { instrumentsLength } = eveDex;

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
    isLoading: isLoading || isLoadingEveDex,
  };
};

export default useInstruments;

export const useInstrumentsPrices = () => {
  const { instruments } = useInstruments();
  const prices = usePrices();
  return instruments
    .map((i) => ({
      index: i.index,
      price: (prices[i.token.address] as bigint) || 0n,
    }))
    .sort((a, b) => a.index - b.index);
};

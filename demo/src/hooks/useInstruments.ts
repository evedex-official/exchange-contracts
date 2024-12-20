import { useReadContracts } from "wagmi";

import { Btc, Eth, EveDEX } from "../contracts";
import { convertCallsResult, getContractCalls, parsePrice } from "../helpers";
import {
  Instrument,
  InstrumentExtended,
  Token,
} from "../helpers/event-horizon-types";
import useEveDex from "./useEveDex";
import { useConfig } from "../providers/ConfigProvider";

const contractConfig = {
  abi: EveDEX.abi,
  address: EveDEX.address,
};

const instrumentsConfig: {
  [ticker: string]: { ticker: string; token: Token };
} = {
  "BTC/USD": {
    ticker: "BTC/USD",
    token: {
      address: Btc.address,
      symbol: "BTC",
      decimals: 18,
      name: "Bitcoin",
    },
  },
  "ETH/USD": {
    ticker: "ETH/USD",
    token: {
      address: Eth.address,
      symbol: "ETH",
      decimals: 18,
      name: "Ethereum",
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
  const { instrumentsPrices } = useConfig();
  console.log("instrumentsPrices", instrumentsPrices, instruments);
  return instruments
    .map((i) => ({
      index: i.index,
      price: parsePrice(instrumentsPrices[i.ticker] || 0, {
        tokenDecimals: BigInt(i.token.decimals),
      }),
    }))
    .sort((a, b) => a.index - b.index);
};

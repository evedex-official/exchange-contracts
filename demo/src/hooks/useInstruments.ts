import { useBlockNumber, useReadContracts } from "wagmi";

import { Btc, Eth, EveDEX } from "../contracts";
import { convertCallsResult, getContractCalls, parsePrice } from "../helpers";
import {
  Instrument,
  InstrumentExtended,
  InstrumentFR,
  Token,
} from "../helpers/event-horizon-types";
import useEveDex from "./useEveDex";
import { useConfig } from "../providers/ConfigProvider";
import { useEffect } from "react";

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
      decimals: 8,
      name: "Bitcoin",
    },
  },
  "ETH/USD": {
    ticker: "ETH/USD",
    token: {
      address: Eth.address,
      symbol: "ETH",
      decimals: 8,
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

    calls.push({
      key: `fr-${i.toString()}`,
      functionName: "getFundingRateData",
      args: [i, 0n, 100000000n],
    });
  }

  const contractCalls = getContractCalls(calls, contractConfig);

  const { data, isLoading, refetch } = useReadContracts({
    contracts: contractCalls,
    query: {
      enabled: instrumentsLength > 0,
    },
  });

  const { data: blockNumber } = useBlockNumber({ watch: true });

  useEffect(() => {
    refetch();
  }, [blockNumber]);

  const convertedCalls = convertCallsResult(calls, data) as {
    [x: string]: Instrument | InstrumentFR[];
  };

  const instrumentsExtended: InstrumentExtended[] = [];

  Object.keys(convertedCalls)
    .filter((k) => !k.includes("fr-"))
    .forEach((key) => {
      const value = convertedCalls[key] as Instrument;
      instrumentsExtended.push({
        index: parseInt(key),
        ...value,
        ...instrumentsConfig[value.ticker],
        fr: (convertedCalls[`fr-${key}`] || []) as InstrumentFR[],
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
  return instruments
    .map((i) => ({
      index: i.index,
      price: parsePrice(instrumentsPrices[i.ticker] || 0, {
        tokenDecimals: 8n, //BigInt(i.token.decimals),
      }),
    }))
    .sort((a, b) => a.index - b.index);
};

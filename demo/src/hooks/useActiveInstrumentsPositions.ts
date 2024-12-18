import { Address } from "viem";

import useEveDexAccount from "./useEveDexAccount";

const useActiveInstrumentsPositions = (address: Address) => {
  const { data, isLoading } = useEveDexAccount(address);
  return { data: data.activeInstrumentsPositions, isLoading };
};

export default useActiveInstrumentsPositions;

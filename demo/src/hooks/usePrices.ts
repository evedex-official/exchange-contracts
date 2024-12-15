import { useConfig } from "../providers/ConfigProvider";

const usePrices = () => {
  const { prices } = useConfig();

  return prices;
};

export default usePrices;

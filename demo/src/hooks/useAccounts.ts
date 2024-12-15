import { privateKeyToAccount } from "viem/accounts";
import { useConfig } from "../providers/ConfigProvider";

const useAccounts = () => {
  const { accounts } = useConfig();

  return accounts;
};

export default useAccounts;

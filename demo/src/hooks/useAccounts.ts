import { privateKeyToAccount } from "viem/accounts";
import { useConfig } from "../providers/ConfigProvider";

const useAccounts = () => {
  const { accounts } = useConfig();

  const [
    owner,
    alice,
    bob,
    matcher,
    liquidator,
    aliceSession,
    bobSession,
  ] = accounts;

  return {
    owner: {
      key: "Owner",
      account: privateKeyToAccount(owner),
    },
    alice: {
      key: "Alice",
      account: privateKeyToAccount(alice),
    },
    bob: {
      key: "Bob",
      account: privateKeyToAccount(bob),
    },
    matcher: {
      key: "Matcher",
      account: privateKeyToAccount(matcher),
    },
    liquidator: {
      key: "Liquidator",
      account: privateKeyToAccount(liquidator),
    },
    aliceSession: {
      key: "Alice's Session",
      account: privateKeyToAccount(aliceSession),
    },
    bobSession: {
      key: "Bob's Session",
      account: privateKeyToAccount(bobSession),
    },
  };
};

export default useAccounts;

import React from "react";
import { PrivateKeyAccount } from "viem";

import useAccounts from "../../hooks/useAccounts";
import { useBalances } from "../../hooks";
import { Btc, Usdt } from "../../contracts";
import Collapse from "../Collapse";

type AccountProps = {
  accountKey: string;
  account: PrivateKeyAccount;
};

const Account: React.FC<AccountProps> = ({ accountKey, account }) => {
  const { isLoading, balances } = useBalances(
    [Usdt.address, Btc.address],
    account.address
  );
  return (
    <div>
      {/* <div>
        <strong>{accountKey}</strong> (
        <span>
          USDT: {isLoading ? "Loading..." : balances[Usdt.address].toString()}
        </span>{" "}
        <span>
          Bitcoin: {isLoading ? "Loading..." : balances[Btc.address].toString()}
        </span>
        )
      </div> */}
      <div>
        <strong>{accountKey}</strong>: {account.address}
      </div>
    </div>
  );
};

const Accounts = () => {
  const { owner, alice, bob, matcher, liquidator } = useAccounts();
  const accs = [owner, alice, bob, matcher, liquidator];
  return (
    <Collapse title="Accounts">
      <div className="accounts-list">
        {accs.map((acc) => (
          <Account key={acc.key} account={acc.wallet} accountKey={acc.key} />
        ))}
      </div>
    </Collapse>
  );
};

export default Accounts;

import React from "react";
import { Address, PrivateKeyAccount } from "viem";

import { Btc, Usdt } from "../../contracts";
import { useDexBalance } from "../../hooks";

type BalanceProps = {
  address: Address;
  account: PrivateKeyAccount;
};

const Balance: React.FC<BalanceProps> = ({ address, account }) => {
  const { formatted, token, isLoading } = useDexBalance(
    address,
    account.address!
  );
  return isLoading ? (
    "Loading..."
  ) : (
    <div>
      {token.name}: {formatted} {token.symbol}
    </div>
  );
};

type DexBalancesProps = {
  account: PrivateKeyAccount;
};

const DexBalances: React.FC<DexBalancesProps> = ({ account }) => {
  const tokens = [Usdt.address, Btc.address];
  return (
    <div>
      <h4>Dex Balances</h4>
      {tokens.map((address) => (
        <Balance key={address} address={address as Address} account={account} />
      ))}
    </div>
  );
};

export default DexBalances;

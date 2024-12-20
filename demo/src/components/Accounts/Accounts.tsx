import React from "react";
import { Address, PrivateKeyAccount } from "viem";

import useAccounts from "../../hooks/useAccounts";
import { useBalances } from "../../hooks";
import Collapse from "../Collapse";
import useMarginLevel from "../../hooks/useMarginLevel";
import useInstruments from "../../hooks/useInstruments";
import useCollaterals from "../../hooks/useCollaterals";
import usePrices from "../../hooks/usePrices";
import { useDexBalances } from "../../hooks/useDexBalance";
import Balances from "../Balances";
import useEveDexAccount from "../../hooks/useEveDexAccount";
import { Collateral } from "../../helpers/event-horizon-types";
import useLiquidator from "../../hooks/useLiquidator";
import Button from "../Button";
import useEveDex from "../../hooks/useEveDex";
import { toast } from "react-toastify";

type AccountProps = {
  accountKey: string;
  account: PrivateKeyAccount;
};

const Account: React.FC<AccountProps> = ({ accountKey, account }) => {
  const { data: eveDex } = useEveDex();
  const { liquidate, isLiquidating } = useLiquidator();
  const { collaterals } = useCollaterals();
  const prices = usePrices();

  const mappedCollaterals: { [x: Address]: any } = {};
  const collateralAddresses: Address[] = [];
  const collateralsPrices: any[] = [];
  collaterals.forEach((collateral: Collateral) => {
    mappedCollaterals[collateral.address] = collateral;
    collateralAddresses.push(collateral.address);
    collateralsPrices.push({
      collateral: collateral.address,
      price: prices[collateral.address],
    });
  });
  const { balances, isLoading: isLoadingBalances } = useBalances(
    collateralAddresses,
    account.address
  );
  const { dexBalances, isLoading: isLoadingDexBalances } = useDexBalances(
    collateralAddresses,
    account.address
  );

  const { data: eveDexAccount } = useEveDexAccount(account.address);

  const preparedBalances = collateralAddresses.map((c) => ({
    value: balances[c],
    token: mappedCollaterals[c],
  }));
  const preparedDexBalances = collateralAddresses.map((c) => ({
    value: dexBalances[c],
    token: mappedCollaterals[c],
  }));
  const onLiquidate = async () => {
    try {
      const collateral = collaterals.find(
        (c: Collateral) => c.symbol === "USDT"
      );
      const tx = await liquidate(account.address, collateral);
      toast.success(`Liquidated: ${tx}`);
    } catch (e) {
      toast.error((e as any).message);
      console.error(e);
    }
  };
  const canLiquidate =
    eveDex.soLevel > eveDexAccount.marginLevel && eveDexAccount.margin > 0;
  return (
    <div>
      <Balances
        title="Balances"
        isLoading={isLoadingBalances}
        balances={preparedBalances}
      />
      <Balances
        title="DepositDex Balances"
        isLoading={isLoadingDexBalances}
        balances={preparedDexBalances}
      />
      <Collapse title="EveDex Account">
        <Button
          disabled={!canLiquidate}
          isLoading={isLiquidating}
          onClick={onLiquidate}
        >
          Liquidate
        </Button>
        <pre>{JSON.stringify(eveDexAccount, null, 2)}</pre>
      </Collapse>
    </div>
  );
};

const Accounts = () => {
  const { alice, bob, liquidator } = useAccounts();
  const accs = [alice, bob, liquidator];
  return (
    <div>
      <h2>Accounts</h2>
      <div className="accounts-list">
        {accs.map((acc, index) => (
          <React.Fragment key={acc.key}>
            <Collapse title={acc.key}>
              <Account account={acc.wallet} accountKey={acc.key} />
            </Collapse>
            {accs.length - 1 !== index && <hr />}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default Accounts;

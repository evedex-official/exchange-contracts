// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {SignedMath} from "@openzeppelin/contracts/utils/math/SignedMath.sol";
import {BaseDEX, FundingRateInfo} from "./base/BaseDEX.sol";
import "./interfaces/IEVEDEX.sol";

contract EVEDEX is BaseDEX, IEVEDEX {
  using EnumerableSet for EnumerableSet.UintSet;
  using EnumerableSet for EnumerableSet.AddressSet;

  constructor() {}

  function initialize(
    address initialOwner_,
    address depositDex_,
    address sessionManager_,
    address marginCalculator_,
    address fundingRateAccount_,
    uint256 maxOpenPositions_,
    int112 soLevel_,
    int112 withdrawMarginLevel_,
    uint112 liquidationFeePercent_
  ) external initializer {
    __BaseDEX_init(
      initialOwner_,
      depositDex_,
      sessionManager_,
      marginCalculator_,
      fundingRateAccount_,
      maxOpenPositions_,
      soLevel_,
      withdrawMarginLevel_,
      liquidationFeePercent_
    );
  }

  function getActiveInstrumentsIndexes(address account) public view returns (uint256[] memory) {
    return _activeInstruments[account].values();
  }

  function getActiveInstrumentsPositions(
    address account
  ) external view returns (uint256[] memory indexes, PositionInfo[] memory positions) {
    indexes = _activeInstruments[account].values();
    uint256 indexesLen = indexes.length;
    positions = new PositionInfo[](indexesLen);
    for (uint i = 0; i < indexesLen; ++i) {
      positions[i] = _positionInfo[indexes[i]][account];
    }
  }

  function getAccountsWithOpenPositionLength() external view returns (uint256) {
    return _accountsWithOpenPositions.length();
  }

  function getAccountsWithOpenPositions(uint256 offset, uint256 limit) external view returns (address[] memory res) {
    uint256 length = _accountsWithOpenPositions.length();
    if (offset >= length) return res;
    uint256 size = length - offset < limit ? length - offset : limit;
    res = new address[](size);
    for (uint256 i = offset; i < offset + size; ++i) {
      res[i] = _accountsWithOpenPositions.at(i);
    }
  }

  function getOpenPositions(uint256 offset, uint256 limit) external view returns (AccountPositions[] memory positions) {
    uint256 length = _accountsWithOpenPositions.length();
    if (offset >= length) return (positions);
    uint256 size = length - offset < limit ? length - offset : limit;
    positions = new AccountPositions[](size);
    for (uint256 i = offset; i < offset + size; ++i) {
      positions[i].account = _accountsWithOpenPositions.at(i);
      uint256[] memory indexes = getActiveInstrumentsIndexes(positions[i].account);
      uint256 len = indexes.length;
      positions[i].positions = new PositionInfo[](len);
      for (uint256 j = 0; j < len; ++j) {
        positions[i].positions[j] = _positionInfo[indexes[j]][positions[i].account];
      }
    }
  }

  function getTotalFR(
    uint256 index,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) public view returns (int72 totalLongFR, int72 totalShortFR) {
    FundingRateInfo memory frInfo = _getFundingRateInfo(index, historyTimestamp, historySearchHint);
    totalLongFR = _getTotalLongFRInternal(frInfo);
    totalShortFR = _getTotalShortFRInternal(frInfo);
  }

  function _getTotalLongFRInternal(FundingRateInfo memory frInfo) internal pure returns (int72) {
    int72 longFRStored = frInfo.longFRStored;
    return longFRStored < 0 ? longFRStored : (longFRStored * (_FR_PRECISION - frInfo.staticFr)) / _FR_PRECISION;
  }

  function _getTotalShortFRInternal(FundingRateInfo memory frInfo) internal pure returns (int72) {
    int72 shortFRStored = frInfo.shortFRStored;
    return shortFRStored < 0 ? shortFRStored : (shortFRStored * (_FR_PRECISION - frInfo.staticFr)) / _FR_PRECISION;
  }

  function getAccountFR(
    address account,
    uint256 index,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) public view returns (int256) {
    PositionInfo memory positionInfo_ = _positionInfo[index][account];
    FundingRateInfo memory frInfo = _getFundingRateInfo(index, historyTimestamp, historySearchHint);
    int256 accumulatedPercentage;
    if (positionInfo_.position < 0) {
      accumulatedPercentage = (_getTotalShortFRInternal(frInfo) - positionInfo_.positionShortFRStored);
    } else {
      accumulatedPercentage = (_getTotalLongFRInternal(frInfo) - positionInfo_.positionLongFRStored);
    }
    int256 absPosition = int256(SignedMath.abs(positionInfo_.position));
    return positionInfo_.frAccumulated + (absPosition * accumulatedPercentage) / _FR_PRECISION;
  }

  function getPNL(address account, uint256 index, int256 price) public view returns (int256) {
    PositionInfo memory positionInfo_ = _positionInfo[index][account];
    return ((price - positionInfo_.positionAvgPrice) * positionInfo_.position) / _INT_PRECISION;
  }

  // named return parameters because of stack to deep
  function calculateMarginLevel(
    address account,
    PriceData[] memory prices,
    CollateralPriceData[] memory collateralPrices,
    bool checkPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) public view returns (int256 marginLevel, int256 equity, int256 margin, int256[] memory pnls, int256[] memory frs) {
    equity = IDepositDEX(depositDex).getTotalBalance(account, collateralPrices);
    margin = 0;
    uint256 len = prices.length;
    pnls = new int256[](len);
    frs = new int256[](len);
    uint256 pricesChecked = 0;
    for (uint256 i = 0; i < len; ++i) {
      uint256 index = prices[i].index;
      if (!_activeInstruments[account].contains(index)) continue;

      {
        PositionInfo memory positionInfo_ = _positionInfo[index][account];
        uint256 leverage = positionInfo_.leverage;
        leverage = leverage == 0 ? 1 : leverage;
        uint256 absPosition = SignedMath.abs(positionInfo_.position);
        uint256 positionVolume = (absPosition * uint80(positionInfo_.positionAvgPrice)) / _UINT_PRECISION / leverage;
        margin += int256(IMarginCalc(marginCalculator).getMargin(index, positionVolume));
      }

      pnls[i] = getPNL(account, index, int256(prices[i].price));
      frs[i] =
        (getAccountFR(account, index, historyTimestamp, historySearchHint) * int256(prices[i].price)) /
        _INT_PRECISION;
      equity += pnls[i] + frs[i];
      ++pricesChecked;
    }
    if (checkPrices && _activeInstruments[account].length() != pricesChecked) revert IncorrectInstrumentIndexes();

    return (margin != 0 ? (equity * _MARGIN_LEVEL_PRECISION - 1) / margin : int256(0), equity, margin, pnls, frs);
  }

  function checkMarginWithPrices(
    address account,
    int256 marginLevel,
    FullPrices calldata fullPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) public view returns (bool, int256) {
    if (fullPrices.instrumentPrices.length != instrumentsLength) revert PriceArrayLengthError();
    uint256[] memory indices = _activeInstruments[account].values();
    uint256 len = indices.length;
    PriceData[] memory prices = new PriceData[](len);
    for (uint256 i = 0; i < len; ++i) {
      prices[i] = fullPrices.instrumentPrices[indices[i]];
    }
    return
      _checkMargin(
        account,
        marginLevel,
        prices,
        fullPrices.collateralPrices,
        false,
        historyTimestamp,
        historySearchHint
      );
  }

  function _checkMargin(
    address account,
    int256 marginLevel,
    PriceData[] memory prices,
    CollateralPriceData[] memory collateralPrices,
    bool checkPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) internal view returns (bool, int256) {
    (int256 accountMarginLevel, int256 equity, int256 margin, , ) = calculateMarginLevel(
      account,
      prices,
      collateralPrices,
      checkPrices,
      historyTimestamp,
      historySearchHint
    );
    return ((margin == 0 || accountMarginLevel >= marginLevel), equity);
  }

  function _calculateLiquidationFee(PositionInfo memory position) internal view returns (uint256) {
    uint256 absPosition = SignedMath.abs(position.position);
    // TODO make fixed with constant precision
    uint256 margin = (absPosition * uint80(position.positionAvgPrice)) / _UINT_PRECISION / position.leverage;
    uint256 liquidationFee = (margin * liquidationFeePercent) / _UINT_PRECISION;

    return liquidationFee;
  }

  //////////////////////////
  //  Mutative functions
  //////////////////////////
  function liquidatePositions(
    MultiOrderLiquidation memory liquidationOrder,
    FullPrices calldata fullPrices,
    LiquidationCollaterals calldata collateralIndices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external onlyRole(MATCHER_ROLE) {
    OrderValidationLib.checkLiquidationOrder(liquidationOrder, historyTimestamp);

    //TODO double calculation of pnl in checkMargin and then liquidationPosition
    (bool validMargin, ) = _checkMargin(
      liquidationOrder.accountToLiquidate,
      soLevel,
      liquidationOrder.prices,
      fullPrices.collateralPrices,
      true,
      historyTimestamp,
      historySearchHint
    );
    if (validMargin) revert SufficientMargin();

    uint256 liquidationPricesLength = liquidationOrder.liquidationPrices.length;
    for (uint256 i = 0; i < liquidationPricesLength; ++i) {
      uint256 liquidationPrice = liquidationOrder.liquidationPrices[i].price;
      uint256 index = liquidationOrder.liquidationPrices[i].index;
      _liquidatePosition(
        index,
        liquidationOrder.accountToLiquidate,
        liquidationOrder.liquidator,
        int256(liquidationPrice),
        fullPrices,
        collateralIndices,
        liquidationOrder.leverage,
        historyTimestamp,
        historySearchHint
      );
    }
  }

  function _liquidatePosition(
    uint256 index,
    address accountToLiquidate,
    address liquidator,
    int256 liquidationPrice,
    FullPrices calldata fullPrices,
    LiquidationCollaterals calldata collateralIndices,
    uint16 liquidatorLeverage,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) internal returns (int256 pnl, int256 fr, uint256 liquidationFee) {
    PositionInfo storage accountToLiquidatePosition = _positionInfo[index][accountToLiquidate];
    PositionInfo storage liquidatorPosition = _positionInfo[index][liquidator];
    if (accountToLiquidatePosition.position == 0) revert ZeroPositionLiquidation();
    int256 positionAvgPrice = accountToLiquidatePosition.positionAvgPrice;
    pnl = (accountToLiquidatePosition.position * (liquidationPrice - positionAvgPrice)) / _INT_PRECISION;
    fr =
      (getAccountFR(accountToLiquidate, index, historyTimestamp, historySearchHint) * liquidationPrice) /
      _INT_PRECISION;
    liquidationFee = _calculateLiquidationFee(accountToLiquidatePosition);

    _adjustBalances(accountToLiquidate, liquidator, fullPrices, collateralIndices, pnl + fr, int256(liquidationFee));

    _changePosition(
      index,
      liquidator,
      liquidatorPosition,
      collateralIndices.liquidatorIndex,
      accountToLiquidatePosition.position,
      liquidationPrice,
      _MARGIN_LEVEL_PRECISION,
      liquidatorLeverage,
      fullPrices,
      historyTimestamp,
      historySearchHint
    );

    accountToLiquidatePosition.position = 0;
    accountToLiquidatePosition.frAccumulated = 0;
    _updateActivePositions(accountToLiquidate, index, 0);

    emit PositionLiquidated(
      accountToLiquidate,
      index,
      liquidationFee,
      IDepositDEX(depositDex).getTotalBalance(accountToLiquidate, fullPrices.collateralPrices),
      pnl,
      fr
    );
  }

  function _adjustBalances(
    address accountToLiquidate,
    address liquidator,
    FullPrices calldata fullPrices,
    LiquidationCollaterals calldata collateralIndices,
    int256 sumPnlFr,
    int256 liquidationFee
  ) internal {
    uint256 len = collateralIndices.indicesToLiquidate.length;
    address collateral;
    int256 collateralPrice;
    int256 balance;
    int256 balanceOfLiquidator;
    for (uint256 i; i < len && sumPnlFr < 0; i++) {
      uint256 index = collateralIndices.indicesToLiquidate[i];
      collateral = fullPrices.collateralPrices[index].collateral;
      collateralPrice = int256(fullPrices.collateralPrices[index].price);
      balance = _getBalance(accountToLiquidate, collateral);
      balanceOfLiquidator = _getBalance(liquidator, collateral);

      int256 newBalance = balance + ((sumPnlFr - liquidationFee) * _INT_PRECISION) / collateralPrice;
      if (newBalance > 0) {
        _setBalance(accountToLiquidate, collateral, newBalance);
        _setBalance(liquidator, collateral, balanceOfLiquidator + (liquidationFee * _INT_PRECISION) / collateralPrice);
        sumPnlFr = 0;
      } else {
        _setBalance(accountToLiquidate, collateral, 0);
        sumPnlFr = sumPnlFr + (balance * collateralPrice) / _INT_PRECISION;
      }
    }

    if (sumPnlFr < 0) {
      _setBalance(
        liquidator,
        collateral,
        balanceOfLiquidator + balance + (sumPnlFr * _INT_PRECISION) / collateralPrice
      );
    }
  }

  /**
   * @notice Executes an ADL (Auto-Deleveraging) liquidation for a specific account.
   */
  function adlLiquidation(
    AdlOrderLiquidation memory liquidationOrder,
    FullPrices calldata fullPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external onlyRole(MATCHER_ROLE) {
    uint256 index = liquidationOrder.index;
    if (liquidationOrder.prices[0].index != index) revert PriceOfLiquidatedInstrumentNotFirst();

    int256 soLevel_ = soLevel;
    (bool validMargin, ) = _checkMargin(
      liquidationOrder.accountToLiquidate,
      soLevel_,
      liquidationOrder.prices,
      fullPrices.collateralPrices,
      true,
      historyTimestamp,
      historySearchHint
    );
    if (validMargin) revert SufficientMargin();
    PositionInfo storage positionInfoLiquidator = _positionInfo[index][liquidationOrder.liquidator];
    PositionInfo storage positionInfoToLiquidate = _positionInfo[index][liquidationOrder.accountToLiquidate];
    uint256 liquidatorPositionAvgPrice = uint80(positionInfoLiquidator.positionAvgPrice);
    uint256 liquidationPrice = liquidationOrder.prices[0].price;
    if (
      positionInfoLiquidator.position > 0
        ? liquidationPrice < liquidatorPositionAvgPrice
        : liquidationPrice > liquidatorPositionAvgPrice
    ) revert UnprofitableTrade();

    _changePosition(
      index,
      liquidationOrder.liquidator,
      positionInfoLiquidator,
      liquidationOrder.collateralIndexLiquidator,
      liquidationOrder.amount,
      int256(liquidationPrice),
      soLevel_,
      liquidationOrder.leverageLiquidator,
      fullPrices,
      historyTimestamp,
      historySearchHint
    );
    _changePosition(
      index,
      liquidationOrder.accountToLiquidate,
      positionInfoToLiquidate,
      liquidationOrder.collateralIndexToLiquidate,
      -liquidationOrder.amount,
      int256(liquidationPrice),
      _MARGIN_LEVEL_PRECISION,
      liquidationOrder.leverageToLiquidate,
      fullPrices,
      historyTimestamp,
      historySearchHint
    );
  }

  /**
   * @notice Executes an ADL (Auto-Deleveraging) liquidation for a specific account.
   * todo: remove after test
   */
  // function adlLiquidationWithBalanceCheck(
  //   AdlOrderLiquidation memory liquidationOrder,
  //   FullPrices calldata fullPrices,
  //   LiquidationCollaterals calldata collateralIndices,
  //   uint256 historyTimestamp,
  //   uint256 historySearchHint
  // ) external onlyRole(MATCHER_ROLE) {
  //   if (liquidationOrder.prices[0].index != liquidationOrder.index) revert PriceOfLiquidatedInstrumentNotFirst();

  //   (bool validMargin, ) = _checkMargin(
  //     liquidationOrder.accountToLiquidate,
  //     soLevel,
  //     liquidationOrder.prices,
  //     fullPrices.collateralPrices,
  //     true,
  //     historyTimestamp,
  //     historySearchHint
  //   );
  //   if (validMargin) revert SufficientMargin();

  //   uint256 len = collateralIndices.indicesToLiquidate.length;
  //   address collateral;
  //   address liquidator = liquidationOrder.liquidator;
  //   int112 balance;
  //   int112 balanceOfLiquidator;
  //   int112[] memory collaterals = new int112[](len);

  //   for (uint256 i; i < len; i++) {
  //     uint256 index = collateralIndices.indicesToLiquidate[i];
  //     collateral = fullPrices.collateralPrices[index].collateral;
  //     balanceOfLiquidator = _getBalance(liquidator, collateral);
  //     collaterals[i] = balanceOfLiquidator;
  //   }

  //   _liquidatePosition(
  //     liquidationOrder.index,
  //     liquidationOrder.accountToLiquidate,
  //     liquidationOrder.liquidator,
  //     int112(uint112(liquidationOrder.prices[0].price)),
  //     fullPrices,
  //     collateralIndices,
  //     liquidationOrder.leverage,
  //     historyTimestamp,
  //     historySearchHint
  //   );

  //   for (uint256 i; i < len; i++) {
  //     uint256 index = collateralIndices.indicesToLiquidate[i];
  //     collateral = fullPrices.collateralPrices[index].collateral;
  //     balanceOfLiquidator = _getBalance(liquidator, collateral);
  //     if (balanceOfLiquidator < collaterals[i]) revert UnprofitableTrade();
  //   }
  // }

  // function liquidatePosition(
  //   OrderLiquidation memory liquidationOrder,
  //   FullPrices calldata fullPrices,
  //   LiquidationCollaterals calldata collateralIndices,
  //   uint256 historyTimestamp,
  //   uint256 historySearchHint
  // ) external onlyRole(MATCHER_ROLE) {
  //   OrderValidationLib.checkLiquidationOrder(liquidationOrder, historyTimestamp);
  //   if (liquidationOrder.prices[0].index != liquidationOrder.index) revert PriceOfLiquidatedInstrumentNotFirst();

  //   (bool validMargin, ) = _checkMargin(
  //     liquidationOrder.accountToLiquidate,
  //     soLevel,
  //     liquidationOrder.prices,
  //     fullPrices.collateralPrices,
  //     true,
  //     historyTimestamp,
  //     historySearchHint
  //   );
  //   if (validMargin) revert SufficientMargin();

  //   _liquidatePosition(
  //     liquidationOrder.index,
  //     liquidationOrder.accountToLiquidate,
  //     liquidationOrder.liquidator,
  //     int256(liquidationOrder.prices[0].price),
  //     fullPrices,
  //     collateralIndices,
  //     liquidationOrder.leverage,
  //     historyTimestamp,
  //     historySearchHint
  //   );
  // }

  function fillOrders(
    OrderExtended memory buyOrder,
    OrderExtended memory sellOrder,
    uint256 filledPrice,
    uint256 filledAmount,
    FullPrices calldata fullPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external onlyRole(MATCHER_ROLE) {
    // Orders validation
    {
      address buyOrderSigner = buyOrder.order.senderAddress;
      address sellOrderSigner = sellOrder.order.senderAddress;
      if (buyOrder.order.userSession != address(0)) {
        buyOrderSigner = _validateUserOrder(buyOrder.order);
        if (buyOrderSigner == address(0)) revert InvalidSession();
      }
      if (sellOrder.order.userSession != address(0)) {
        sellOrderSigner = _validateUserOrder(sellOrder.order);
        if (sellOrderSigner == address(0)) revert InvalidSession();
      }
      (bytes32 buyOrderDigest, bytes32 sellOrderDigest) = OrderValidationLib.checkOrdersInfo(
        buyOrder.order,
        sellOrder.order,
        buyOrderSigner,
        sellOrderSigner,
        msg.sender,
        filledAmount,
        filledPrice,
        msg.sender,
        instrumentsLength,
        historyTimestamp
      );

      _fillOrder(buyOrderDigest, buyOrder.order.amount, filledAmount);
      _fillOrder(sellOrderDigest, sellOrder.order.amount, filledAmount);
    }
    // Paying execution fee to matcher
    {
      address buyOrderCollateral = fullPrices.collateralPrices[buyOrder.collateralIndex].collateral;
      address sellOrderCollateral = fullPrices.collateralPrices[sellOrder.collateralIndex].collateral;
      buyOrder.order.matcherFee = (buyOrder.order.matcherFee * filledAmount) / buyOrder.order.amount;
      sellOrder.order.matcherFee = (sellOrder.order.matcherFee * filledAmount) / sellOrder.order.amount;
      int256 buyOrderMatcherFee = int256(
        (buyOrder.order.matcherFee * _UINT_PRECISION) / fullPrices.collateralPrices[buyOrder.collateralIndex].price
      );
      int256 sellOrderMatcherFee = int256(
        (sellOrder.order.matcherFee * _UINT_PRECISION) / fullPrices.collateralPrices[sellOrder.collateralIndex].price
      );
      _setBalance(
        buyOrder.order.senderAddress,
        buyOrderCollateral,
        _getBalance(buyOrder.order.senderAddress, buyOrderCollateral) - buyOrderMatcherFee
      );
      _setBalance(
        sellOrder.order.senderAddress,
        sellOrderCollateral,
        _getBalance(sellOrder.order.senderAddress, sellOrderCollateral) - sellOrderMatcherFee
      );
      _setBalance(
        buyOrder.order.matcherAddress,
        buyOrderCollateral,
        _getBalance(buyOrder.order.matcherAddress, buyOrderCollateral) + buyOrderMatcherFee
      );
      _setBalance(
        sellOrder.order.matcherAddress,
        sellOrderCollateral,
        _getBalance(sellOrder.order.matcherAddress, sellOrderCollateral) + sellOrderMatcherFee
      );
    }

    uint256 index = buyOrder.order.instrumentIndex;
    PositionInfo storage buyerUserData = _positionInfo[index][buyOrder.order.senderAddress];
    PositionInfo storage sellerUserData = _positionInfo[index][sellOrder.order.senderAddress];
    int256 amount = int256(filledAmount);
    int256 soLevel_ = soLevel;

    _changePosition(
      index,
      buyOrder.order.senderAddress,
      buyerUserData,
      buyOrder.collateralIndex,
      amount,
      int256(filledPrice),
      soLevel_,
      buyOrder.order.leverage,
      fullPrices,
      historyTimestamp,
      historySearchHint
    );
    _changePosition(
      index,
      sellOrder.order.senderAddress,
      sellerUserData,
      sellOrder.collateralIndex,
      -amount,
      int256(filledPrice),
      soLevel_,
      sellOrder.order.leverage,
      fullPrices,
      historyTimestamp,
      historySearchHint
    );

    emit NewTrade(index, buyOrder.order.senderAddress, sellOrder.order.senderAddress, filledPrice, filledAmount);
  }

  function collectFr(
    address account,
    FullPrices calldata fullPrices,
    uint256 collateralIndex,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external onlyRole(MATCHER_ROLE) {
    uint256 len = fullPrices.instrumentPrices.length;
    // todo: _activeInstruments
    for (uint256 i = 0; i < len; ++i) {
      _collectFr(
        fullPrices.instrumentPrices[i].index,
        account,
        fullPrices,
        collateralIndex,
        historyTimestamp,
        historySearchHint
      );
    }
  }

  function _fillOrder(bytes32 orderDigest, uint256 orderAmount, uint256 filledAmount) internal {
    uint256 newFilledAmount = filledAmounts[orderDigest] + filledAmount;
    if (newFilledAmount > orderAmount) revert OrderIsAlreadyFilled();
    filledAmounts[orderDigest] = newFilledAmount;
  }

  function _collectFr(
    uint256 index,
    address account,
    FullPrices calldata fullPrices,
    uint256 collateralIndex,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) internal {
    PositionInfo storage positionInfo = _positionInfo[index][account];
    int256 frCurrent = getAccountFR(account, index, historyTimestamp, historySearchHint);
    if (frCurrent == 0) return;
    address collateral = fullPrices.collateralPrices[collateralIndex].collateral;
    int256 collateralPrice = int256(fullPrices.collateralPrices[collateralIndex].price);
    int256 realizedFRCollateral = (frCurrent * positionInfo.positionAvgPrice) / _INT_PRECISION;
    int256 collateralFee = (realizedFRCollateral * _INT_PRECISION) / collateralPrice;
    _setBalance(fundingRateAccount, collateral, _getBalance(fundingRateAccount, collateral) - collateralFee);
    _setBalance(account, collateral, _getBalance(account, collateral) + collateralFee);
    positionInfo.frAccumulated = 0; // todo: what to do with this?
    (positionInfo.positionLongFRStored, positionInfo.positionShortFRStored) = getTotalFR(
      index,
      historyTimestamp,
      historySearchHint
    );
    positionInfo.positionLastUpdate = uint32(historyTimestamp);
    emit FrCollected(index, account, collateralIndex, _getBalance(account, collateral));
  }

  // todo: remove in prod
  //  function _collectFr(
  //    uint256 index,
  //    address account,
  //    FullPrices calldata fullPrices,
  //    uint256 collateralIndex,
  //    uint256 historyTimestamp,
  //    uint256 historySearchHint
  //  ) internal {
  //    PositionInfo storage positionInfo = _positionInfo[index][account];
  //    int256 frCurrent = getAccountFR(account, index, historyTimestamp, historySearchHint);
  //    int256 staticFr = getStaticFR(historyTimestamp, historySearchHint);
  //    FundingRateInfo memory frInfo = _getFundingRateInfo(index, historyTimestamp, historySearchHint);
  //    int256 newFrLongStored = _getTotalLongFRInternal(frInfo);
  //    int256 newFrShortStored = _getTotalShortFRInternal(frInfo);
  //    if (frCurrent == 0) return;
  //    address collateral = fullPrices.collateralPrices[collateralIndex].collateral;
  //    int256 collateralPrice = int112(fullPrices.collateralPrices[collateralIndex].price);
  //    int256 realizedFRCollateral = (frCurrent * int112(uint112(positionInfo.positionAvgPrice))) / _INT_PRECISION;
  //    int256 collateralFee = (realizedFRCollateral * _INT_PRECISION) / collateralPrice;
  //    int256 accountNewBalance;
  //    if (collateralFee < 0) {
  //      accountNewBalance = _getBalance(account, collateral) + collateralFee;
  //    } else {
  //      int256 staticFee = (realizedFRCollateral *
  //        int256(staticFr) *
  //        _INT_PRECISION) /
  //        collateralPrice /
  //        int256(_FR_PRECISION);
  //      accountNewBalance = _getBalance(account, collateral) + collateralFee - staticFee;
  //      _setBalance(staticFundingRateAccount, collateral, _getBalance(staticFundingRateAccount, collateral) + staticFee);
  //    }
  //    _setBalance(fundingRateAccount, collateral, _getBalance(fundingRateAccount, collateral) - collateralFee);
  //    _setBalance(account, collateral, accountNewBalance);
  //    positionInfo.frAccumulated = 0; // todo: what to do with this?
  //    positionInfo.positionLongFRStored = int72(newFrLongStored);
  //    positionInfo.positionShortFRStored = int72(newFrShortStored);
  //    positionInfo.positionLastUpdate = uint32(historyTimestamp);
  //    emit FrCollected(index, account, collateralIndex, accountNewBalance);
  //  }

  function _changePosition(
    uint256 index,
    address positionOwner,
    PositionInfo storage posData,
    uint256 collateralIndex,
    int256 amount,
    int256 price,
    int256 marginLevel,
    uint16 leverage,
    FullPrices calldata fullPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) internal {
    int256 oldPosition = posData.position;
    int256 newPosition = amount + oldPosition;
    int256 realizedFRCollateral;
    int256 realizedPNL;
    address collateral = fullPrices.collateralPrices[collateralIndex].collateral;
    int256 collateralPrice = int256(fullPrices.collateralPrices[collateralIndex].price);
    // change position side
    if ((oldPosition > 0 && newPosition <= 0) || (oldPosition < 0 && newPosition >= 0)) {
      (realizedFRCollateral, realizedPNL) = _changePositionSide(
        index,
        positionOwner,
        posData,
        price,
        collateral,
        collateralPrice,
        historyTimestamp,
        historySearchHint
      );
      // increase position
    } else if ((newPosition > 0 && amount > 0) || (newPosition < 0 && amount < 0)) {
      _increasePosition(
        index,
        positionOwner,
        posData,
        amount,
        price,
        newPosition,
        oldPosition,
        historyTimestamp,
        historySearchHint
      );
      //  Partially close.
    } else {
      (realizedFRCollateral, realizedPNL) = _partiallyClosePosition(
        index,
        positionOwner,
        posData,
        amount,
        price,
        newPosition,
        oldPosition,
        collateral,
        collateralPrice,
        historyTimestamp,
        historySearchHint
      );
    }

    posData.position = int112(newPosition);
    posData.leverage = leverage;
    (posData.positionLongFRStored, posData.positionShortFRStored) = getTotalFR(
      index,
      historyTimestamp,
      historySearchHint
    );
    posData.positionLastUpdate = uint32(historyTimestamp);

    _updateActivePositions(positionOwner, index, posData.position);
    (bool validMargin, ) = checkMarginWithPrices(
      positionOwner,
      marginLevel,
      fullPrices,
      historyTimestamp,
      historySearchHint
    );
    if (!validMargin) revert InsufficientMargin();

    emit PositionUpdate(
      index,
      positionOwner,
      _getBalance(positionOwner, collateral),
      posData,
      realizedPNL,
      realizedFRCollateral
    );
  }

  function _changePositionSide(
    uint256 index,
    address positionOwner,
    PositionInfo storage posData,
    int256 price,
    address collateral,
    int256 collateralPrice,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) internal returns (int256 realizedFRCollateral, int256 realizedPNL) {
    realizedFRCollateral =
      (getAccountFR(positionOwner, index, historyTimestamp, historySearchHint) * posData.positionAvgPrice) /
      _INT_PRECISION;
    realizedPNL = getPNL(positionOwner, index, price);
    _setBalance(
      positionOwner,
      collateral,
      _getBalance(positionOwner, collateral) + ((realizedFRCollateral + realizedPNL) * _INT_PRECISION) / collateralPrice
    );
    _setBalance(
      fundingRateAccount,
      collateral,
      _getBalance(fundingRateAccount, collateral) - (realizedFRCollateral * _INT_PRECISION) / collateralPrice
    );
    posData.frAccumulated = 0;
    posData.positionAvgPrice = int80(price);
  }

  function _increasePosition(
    uint256 index,
    address positionOwner,
    PositionInfo storage posData,
    int256 amount,
    int256 price,
    int256 newPosition,
    int256 oldPosition,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) internal {
    posData.positionAvgPrice = int80((amount * price + oldPosition * posData.positionAvgPrice) / newPosition);
    posData.frAccumulated = int112(getAccountFR(positionOwner, index, historyTimestamp, historySearchHint));
  }

  function _partiallyClosePosition(
    uint256 index,
    address positionOwner,
    PositionInfo storage posData,
    int256 amount,
    int256 price,
    int256 newPosition,
    int256 oldPosition,
    address collateral,
    int256 collateralPrice,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) internal returns (int256 realizedFRCollateral, int256 realizedPNL) {
    int256 frCurrent = getAccountFR(positionOwner, index, historyTimestamp, historySearchHint);

    //  In this case, amount and oldPosition would have different signs
    realizedFRCollateral = (frCurrent * posData.positionAvgPrice * -1 * amount) / oldPosition / _INT_PRECISION;
    realizedPNL = (getPNL(positionOwner, index, price) * amount * -1) / oldPosition;

    _setBalance(
      positionOwner,
      collateral,
      _getBalance(positionOwner, collateral) + ((realizedFRCollateral + realizedPNL) * _INT_PRECISION) / collateralPrice
    );
    _setBalance(
      fundingRateAccount,
      collateral,
      _getBalance(fundingRateAccount, collateral) - (realizedFRCollateral * _INT_PRECISION) / collateralPrice
    );
    posData.frAccumulated = int112((frCurrent * newPosition) / oldPosition);
  }

  function _validateUserOrder(Order memory order) internal returns (address) {
    return ISessionManager(sessionManager).validateUserOrder(order);
  }

  function _updateActivePositions(address account, uint256 index, int256 position) internal {
    if (position == 0) {
      _activeInstruments[account].remove(index);
      if (_activeInstruments[account].length() == 0) {
        _accountsWithOpenPositions.remove(account);
      }
    } else {
      if (_activeInstruments[account].length() >= maxOpenPositions) revert MaxOpenPositionsExceeded();
      _activeInstruments[account].add(index);
      _accountsWithOpenPositions.add(account);
    }
    settledOrders[account]++;
  }
}

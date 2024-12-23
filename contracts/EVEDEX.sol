// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
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

  function getTotalShortFR(
    uint256 index,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) public view override(BaseDEX, IEVEDEX) returns (int72) {
    FundingRateInfo memory fundingRateInfo = _getFundingRateInfo(index, historyTimestamp, historySearchHint);
    return fundingRateInfo.shortFRStored;
  }

  function getTotalLongFR(
    uint256 index,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) public view override(BaseDEX, IEVEDEX) returns (int72) {
    FundingRateInfo memory fundingRateInfo = _getFundingRateInfo(index, historyTimestamp, historySearchHint);
    return fundingRateInfo.longFRStored;
  }

  function getAccountFR(
    address account,
    uint256 index,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) public view returns (int112) {
    PositionInfo memory positionInfo_ = _positionInfo[index][account];
    int256 accumulatedPercentage;
    if (positionInfo_.position < 0) {
      accumulatedPercentage = (getTotalShortFR(index, historyTimestamp, historySearchHint) -
        positionInfo_.positionShortFRStored);
    } else {
      accumulatedPercentage = (getTotalLongFR(index, historyTimestamp, historySearchHint) -
        positionInfo_.positionLongFRStored);
    }
    int112 absPosition = positionInfo_.position < 0 ? -positionInfo_.position : positionInfo_.position;
    return int112(positionInfo_.frAccumulated + (absPosition * accumulatedPercentage) / _FR_PRECISION);
  }

  function getPNL(address account, uint256 index, int112 price) public view returns (int112) {
    PositionInfo memory positionInfo_ = _positionInfo[index][account];
    return
      int112(
        (int256(positionInfo_.position) * (price - int112(uint112(positionInfo_.positionAvgPrice)))) / _INT_PRECISION
      );
  }

  // named return parameters because of stack to deep
  function calculateMarginLevel(
    address account,
    PriceData[] memory prices,
    CollateralPriceData[] memory collateralPrices,
    bool checkPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) public view returns (int112 marginLevel, int112 equity, int112 margin, int112[] memory pnls, int112[] memory frs) {
    equity = IDepositDEX(depositDex).getTotalBalance(account, collateralPrices);
    margin = 0;
    uint256 len = prices.length;
    pnls = new int112[](len);
    frs = new int112[](len);
    uint256 pricesChecked = 0;
    for (uint256 i = 0; i < len; ++i) {
      uint256 index = prices[i].index;
      if (!_activeInstruments[account].contains(index)) continue;

      {
        PositionInfo memory positionInfo_ = _positionInfo[index][account];
        int256 leverage = int256(uint256(positionInfo_.leverage));
        leverage = leverage == 0 ? int256(1) : leverage;
        int256 absPosition = positionInfo_.position < 0 ? -positionInfo_.position : positionInfo_.position;
        margin += int112((absPosition * int256(uint256(positionInfo_.positionAvgPrice))) / _INT_PRECISION / leverage);
      }

      pnls[i] = getPNL(account, index, int112(uint112(prices[i].price)));
      frs[i] = int112(
        (getAccountFR(account, index, historyTimestamp, historySearchHint) * int256(prices[i].price)) / _INT_PRECISION
      );
      equity += pnls[i] + frs[i];
      ++pricesChecked;
    }
    if (checkPrices && _activeInstruments[account].length() != pricesChecked) revert IncorrectInstrumentIndexes();

    return (margin != 0 ? (equity * 100 - 1) / margin : int112(0), equity, margin, pnls, frs);
  }

  function checkMarginWithPrices(
    address account,
    int112 marginLevel,
    FullPrices calldata fullPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) public view returns (bool, int112) {
    if (fullPrices.instrumentPrices.length != instrumentsLength) revert PriceArrayLengthError();
    uint256[] memory indices = _activeInstruments[account].values();
    PriceData[] memory prices = new PriceData[](indices.length);
    for (uint256 i = 0; i < indices.length; ++i) {
      uint256 index = indices[i];
      prices[i] = fullPrices.instrumentPrices[index];
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
    int112 marginLevel,
    PriceData[] memory prices,
    CollateralPriceData[] memory collateralPrices,
    bool checkPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) internal view returns (bool, int112) {
    (int112 accountMarginLevel, int112 equity, int112 margin, , ) = calculateMarginLevel(
      account,
      prices,
      collateralPrices,
      checkPrices,
      historyTimestamp,
      historySearchHint
    );
    return ((margin == 0 || accountMarginLevel >= marginLevel), equity);
  }

  function _calculateLiquidationFee(PositionInfo memory position) internal view returns (uint112) {
    uint112 absPosition = position.position < 0 ? uint112(-position.position) : uint112(position.position);
    // TODO make fixed with constant precision
    uint112 margin = (absPosition * position.positionAvgPrice) / _UINT_PRECISION / position.leverage;
    uint112 liquidationFee = (margin * uint112(liquidationFeePercent)) / _UINT_PRECISION;

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
      uint112 liquidationPrice = uint112(liquidationOrder.liquidationPrices[i].price);
      uint256 index = liquidationOrder.liquidationPrices[i].index;
      _liquidatePosition(
        index,
        liquidationOrder.accountToLiquidate,
        liquidationOrder.liquidator,
        int112(liquidationPrice),
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
    int112 liquidationPrice,
    FullPrices calldata fullPrices,
    LiquidationCollaterals calldata collateralIndices,
    uint16 liquidatorLeverage,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) internal returns (int112 pnl, int112 fr, uint112 liquidationFee) {
    PositionInfo storage accountToLiquidatePosition = _positionInfo[index][accountToLiquidate];
    PositionInfo storage liquidatorPosition = _positionInfo[index][liquidator];
    if (accountToLiquidatePosition.position == 0) revert ZeroPositionLiquidation();
    int112 positionAvgPrice = int112(uint112(accountToLiquidatePosition.positionAvgPrice));
    pnl = (accountToLiquidatePosition.position * (liquidationPrice - positionAvgPrice)) / _INT_PRECISION;
    fr =
      (getAccountFR(accountToLiquidate, index, historyTimestamp, historySearchHint) * liquidationPrice) /
      _INT_PRECISION;
    liquidationFee = _calculateLiquidationFee(accountToLiquidatePosition);

    _adjustBalances(accountToLiquidate, liquidator, fullPrices, collateralIndices, pnl + fr, int112(liquidationFee));

    _changePosition(
      index,
      liquidator,
      liquidatorPosition,
      collateralIndices.liquidatorIndex,
      accountToLiquidatePosition.position,
      liquidationPrice,
      int112(100),
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
    int112 sumPnlFr,
    int112 liquidationFee
  ) internal {
    uint256 len = collateralIndices.indicesToLiquidate.length;
    address collateral;
    int112 collateralPrice;
    int112 balance;
    int112 balanceOfLiquidator;
    for (uint256 i; i < len && sumPnlFr < 0; i++) {
      uint256 index = collateralIndices.indicesToLiquidate[i];
      collateral = fullPrices.collateralPrices[index].collateral;
      collateralPrice = int112(fullPrices.collateralPrices[index].price);
      balance = _getBalance(accountToLiquidate, collateral);
      balanceOfLiquidator = _getBalance(liquidator, collateral);

      int112 newBalance = balance + ((sumPnlFr - liquidationFee) * _INT_PRECISION) / collateralPrice;
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

  function liquidatePosition(
    OrderLiquidation memory liquidationOrder,
    FullPrices calldata fullPrices,
    LiquidationCollaterals calldata collateralIndices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external onlyRole(MATCHER_ROLE) {
    OrderValidationLib.checkLiquidationOrder(liquidationOrder, historyTimestamp);
    if (liquidationOrder.prices[0].index != liquidationOrder.index) revert PriceOfLiquidatedInstrumentNotFirst();

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

    _liquidatePosition(
      liquidationOrder.index,
      liquidationOrder.accountToLiquidate,
      liquidationOrder.liquidator,
      int112(uint112(liquidationOrder.prices[0].price)),
      fullPrices,
      collateralIndices,
      liquidationOrder.leverage,
      historyTimestamp,
      historySearchHint
    );
  }

  function fillOrders(
    OrderExtended memory buyOrder,
    OrderExtended memory sellOrder,
    uint80 filledPrice,
    uint96 filledAmount,
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
        uint256(filledAmount),
        uint256(filledPrice),
        msg.sender,
        instrumentsLength,
        historyTimestamp
      );

      _fillOrder(buyOrderDigest, buyOrder.order.amount, filledAmount);
      _fillOrder(sellOrderDigest, sellOrder.order.amount, filledAmount);
    }
    // Paying execution fee to matcher
    {
      buyOrder.order.matcherFee = uint64((uint256(buyOrder.order.matcherFee) * filledAmount) / buyOrder.order.amount);
      sellOrder.order.matcherFee = uint64(
        (uint256(sellOrder.order.matcherFee) * filledAmount) / sellOrder.order.amount
      );
      int112 buyOrderMatcherFee = int112(
        (uint112(buyOrder.order.matcherFee) * _UINT_PRECISION) /
          uint112(fullPrices.collateralPrices[buyOrder.collateralIndex].price)
      );
      int112 sellOrderMatcherFee = int112(
        (uint112(sellOrder.order.matcherFee) * _UINT_PRECISION) /
          uint112(fullPrices.collateralPrices[buyOrder.collateralIndex].price)
      );
      _setBalance(
        buyOrder.order.senderAddress,
        buyOrder.order.collateral,
        _getBalance(buyOrder.order.senderAddress, buyOrder.order.collateral) - buyOrderMatcherFee
      );
      _setBalance(
        sellOrder.order.senderAddress,
        sellOrder.order.collateral,
        _getBalance(sellOrder.order.senderAddress, sellOrder.order.collateral) - sellOrderMatcherFee
      );
      _setBalance(
        buyOrder.order.matcherAddress,
        buyOrder.order.collateral,
        _getBalance(buyOrder.order.matcherAddress, buyOrder.order.collateral) + buyOrderMatcherFee
      );
      _setBalance(
        sellOrder.order.matcherAddress,
        sellOrder.order.collateral,
        _getBalance(sellOrder.order.matcherAddress, sellOrder.order.collateral) + sellOrderMatcherFee
      );
    }

    uint256 index = buyOrder.order.instrumentIndex;
    PositionInfo storage buyerUserData = _positionInfo[index][buyOrder.order.senderAddress];
    PositionInfo storage sellerUserData = _positionInfo[index][sellOrder.order.senderAddress];
    int112 amount = int112(uint112(filledAmount));
    int112 soLevel_ = soLevel;

    _changePosition(
      index,
      buyOrder.order.senderAddress,
      buyerUserData,
      buyOrder.collateralIndex,
      amount,
      int112(uint112(filledPrice)),
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
      int112(uint112(filledPrice)),
      soLevel_,
      sellOrder.order.leverage,
      fullPrices,
      historyTimestamp,
      historySearchHint
    );

    emit NewTrade(
      buyOrder.order.instrumentIndex,
      buyOrder.order.senderAddress,
      sellOrder.order.senderAddress,
      filledPrice,
      filledAmount
    );
  }

  function _fillOrder(bytes32 orderDigest, uint256 orderAmount, uint96 filledAmount) internal {
    uint96 newFilledAmount = filledAmounts[orderDigest] + filledAmount;
    if (newFilledAmount > orderAmount) revert OrderIsAlreadyFilled();
    filledAmounts[orderDigest] = newFilledAmount;
  }

  function _changePosition(
    uint256 index,
    address positionOwner,
    PositionInfo storage posData,
    uint256 collateralIndex,
    int112 amount,
    int112 price,
    int112 marginLevel,
    uint16 leverage,
    FullPrices calldata fullPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) internal {
    int112 newPosition = amount + posData.position;

    bool changePositionSide = (posData.position > 0 && newPosition <= 0) || (posData.position < 0 && newPosition >= 0);
    bool increase_position = (newPosition > 0 && amount > 0) || (newPosition < 0 && amount < 0);
    int112 realizedFRCollateral;
    int112 realizedPNL;
    address collateral = fullPrices.collateralPrices[collateralIndex].collateral;
    int112 collateralPrice = int112(fullPrices.collateralPrices[collateralIndex].price);
    if (changePositionSide) {
      realizedFRCollateral =
        (getAccountFR(positionOwner, index, historyTimestamp, historySearchHint) *
          int112(uint112(posData.positionAvgPrice))) /
        _INT_PRECISION;
      realizedPNL = getPNL(positionOwner, index, price);
      _setBalance(
        positionOwner,
        collateral,
        _getBalance(positionOwner, collateral) +
          ((realizedFRCollateral + realizedPNL) * _INT_PRECISION) /
          collateralPrice
      );
      _setBalance(
        fundingRateAccount,
        collateral,
        _getBalance(fundingRateAccount, collateral) - (realizedFRCollateral * _INT_PRECISION) / collateralPrice
      );
      posData.frAccumulated = 0;
      posData.positionAvgPrice = uint80(uint112(price));
    } else if (increase_position) {
      posData.positionAvgPrice = uint80(
        uint112((amount * price + posData.position * int112(uint112(posData.positionAvgPrice))) / newPosition)
      );
      posData.frAccumulated = getAccountFR(positionOwner, index, historyTimestamp, historySearchHint);
    } else {
      //  Partially close.
      int112 frCurrent = getAccountFR(positionOwner, index, historyTimestamp, historySearchHint);

      //  In this case, amount and posData.position would have different signs
      realizedFRCollateral =
        (frCurrent * int112(uint112(posData.positionAvgPrice)) * -1 * amount) /
        posData.position /
        _INT_PRECISION;
      realizedPNL = (getPNL(positionOwner, index, price) * amount * -1) / posData.position;

      _setBalance(
        positionOwner,
        collateral,
        _getBalance(positionOwner, collateral) +
          ((realizedFRCollateral + realizedPNL) * _INT_PRECISION) /
          collateralPrice
      );
      _setBalance(
        fundingRateAccount,
        collateral,
        _getBalance(fundingRateAccount, collateral) - (realizedFRCollateral * _INT_PRECISION) / collateralPrice
      );
      posData.frAccumulated = (frCurrent * newPosition) / posData.position;
    }

    posData.position = newPosition;
    posData.leverage = leverage;
    posData.positionLongFRStored = getTotalLongFR(index, historyTimestamp, historySearchHint);
    posData.positionShortFRStored = getTotalShortFR(index, historyTimestamp, historySearchHint);
    posData.positionLastUpdate = uint32(historyTimestamp);

    _updateActivePositions(positionOwner, index, posData.position);
    {
      (bool validMargin, ) = checkMarginWithPrices(
        positionOwner,
        marginLevel,
        fullPrices,
        historyTimestamp,
        historySearchHint
      );
      if (!validMargin) revert InsufficientMargin();
    }

    emit PositionUpdate(
      index,
      positionOwner,
      _getBalance(positionOwner, collateral),
      posData,
      realizedPNL,
      realizedFRCollateral
    );
  }

  function _validateUserOrder(Order memory order) internal returns (address) {
    return ISessionManager(sessionManager).validateUserOrder(order);
  }

  function _updateActivePositions(address account, uint256 index, int256 position) internal {
    if (position != 0) {
      if (_activeInstruments[account].length() >= maxOpenPositions) revert MaxOpenPositionsExceeded();
      _activeInstruments[account].add(index);
      _accountsWithOpenPositions.add(account);
    } else {
      _activeInstruments[account].remove(index);
      if (_activeInstruments[account].length() == 0) {
        _accountsWithOpenPositions.remove(account);
      }
    }
    settledOrders[account]++;
  }
}

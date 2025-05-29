// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {SignedMath} from "@openzeppelin/contracts/utils/math/SignedMath.sol";
import {BaseDEX, FundingRateInfo, BasicParams} from "./base/BaseDEX.sol";
import "./interfaces/IEVEDEX.sol";

contract EVEDEX is BaseDEX, IEVEDEX {
  using EnumerableSet for EnumerableSet.UintSet;
  using EnumerableSet for EnumerableSet.AddressSet;

  constructor() {}

  function initialize(address initialOwner_, BasicParams calldata params_) external initializer {
    __BaseDEX_init(initialOwner_, params_);
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
  ) public view returns (int72, int72) {
    FundingRateInfo memory frInfo = _getFundingRateInfo(index, historyTimestamp, historySearchHint);
    return (frInfo.longFRStored, frInfo.shortFRStored);
  }

  function getAccountFR(
    address account,
    uint256 index,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) public view returns (int256, int256) {
    PositionInfo memory positionInfo_ = _positionInfo[index][account];
    FundingRateInfo memory frInfo = _getFundingRateInfo(index, historyTimestamp, historySearchHint);
    int256 absPosition = int256(SignedMath.abs(positionInfo_.position));
    int256 accumulatedPercentage;
    int256 staticFee;
    if (positionInfo_.position < 0) {
      accumulatedPercentage = (frInfo.shortFRStored - positionInfo_.positionShortFRStored);
    } else {
      accumulatedPercentage = (frInfo.longFRStored - positionInfo_.positionLongFRStored);
    }
    int256 frDiff = (absPosition * accumulatedPercentage) / _FR_PRECISION;
    if (accumulatedPercentage > 0) {
      staticFee = (frDiff * frInfo.staticFr) / _FR_PRECISION;
    }
    return (positionInfo_.frAccumulated - staticFee + frDiff, staticFee);
  }

  function getPNL(address account, uint256 index, int256 price) public view returns (int256) {
    PositionInfo memory positionInfo_ = _positionInfo[index][account];
    return ((price - positionInfo_.positionAvgPrice) * positionInfo_.position) / _INT_PRECISION;
  }

  function calculateMarginLevel(
    address account,
    PriceData[] memory prices,
    CollateralPriceData[] memory collateralPrices,
    bool checkPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) public view returns (int256 marginLevel, int256 equity, int256 margin, int256[] memory pnls, int256[] memory frs) {
    equity = depositDex.getTotalBalance(account, collateralPrices);
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
        uint16 leverage = positionInfo_.leverage;
        leverage = leverage == 0 ? 1 : leverage;
        positionInfo_.leverage = leverage;
        margin += int256(_getMarginFromCalc(index, positionInfo_));
      }

      pnls[i] = getPNL(account, index, int256(prices[i].price));
      (int256 frsSingle, ) = getAccountFR(account, index, historyTimestamp, historySearchHint);
      frs[i] = (frsSingle * int256(prices[i].price)) / _INT_PRECISION;
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

  function _calculateLiquidationFee(uint256 index, PositionInfo memory position) internal view returns (uint256) {
    return (_getMarginFromCalc(index, position) * liquidationFeePercent) / _UINT_PRECISION;
  }

  function _getMarginFromCalc(uint256 index, PositionInfo memory position) internal view returns (uint256) {
    uint256 absPosition = SignedMath.abs(position.position);
    uint256 positionVolume = (absPosition * uint80(position.positionAvgPrice)) / _UINT_PRECISION / position.leverage;

    return marginCalculator.getMargin(index, positionVolume);
  }

  //////////////////////////
  //  Mutative functions
  //////////////////////////

  // function liquidatePartially(
  //   PartialOrderLiquidation memory liquidationOrder,
  //   FullPrices calldata fullPrices,
  //   LiquidationCollaterals calldata collateralIndices,
  //   uint256 historyTimestamp,
  //   uint256 historySearchHint
  // ) external onlyRole(MATCHER_ROLE) {}

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
    (fr, ) = getAccountFR(accountToLiquidate, index, historyTimestamp, historySearchHint);
    fr = (fr * liquidationPrice) / _INT_PRECISION;
    liquidationFee = _calculateLiquidationFee(index, accountToLiquidatePosition);

    _adjustBalances(accountToLiquidate, liquidator, fullPrices, collateralIndices, pnl + fr, int256(liquidationFee));

    _changePosition(
      index,
      liquidator,
      liquidatorPosition,
      collateralIndices.liquidatorIndex,
      accountToLiquidatePosition.position,
      liquidationPrice,
      soLevel,
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
      depositDex.getTotalBalance(accountToLiquidate, fullPrices.collateralPrices),
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

      int256 newBalance = balance + ((sumPnlFr - liquidationFee) * _COLLATERAL_PRECISION) / collateralPrice;
      if (newBalance > 0) {
        _setBalance(accountToLiquidate, collateral, newBalance);
        _setBalance(
          liquidator,
          collateral,
          balanceOfLiquidator + (liquidationFee * _COLLATERAL_PRECISION) / collateralPrice
        );
        sumPnlFr = 0;
      } else {
        _setBalance(accountToLiquidate, collateral, 0);
        sumPnlFr = sumPnlFr + (balance * collateralPrice) / _COLLATERAL_PRECISION;
      }
    }

    if (sumPnlFr < 0) {
      _setBalance(
        liquidator,
        collateral,
        balanceOfLiquidator + balance + (sumPnlFr * _COLLATERAL_PRECISION) / collateralPrice
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
      type(int256).min,
      liquidationOrder.leverageToLiquidate,
      fullPrices,
      historyTimestamp,
      historySearchHint
    );
  }

  function fillOrder(
    OrderExtended memory filledOrder,
    OrderExtended memory complimentaryOrder,
    uint256 filledPrice,
    uint256 filledAmount,
    FullPrices calldata fullPrices,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external onlyRole(MATCHER_ROLE) {
    // Orders validation
    {
      address filledOrderSigner = filledOrder.order.senderAddress;
      address complimentaryOrderSigner = complimentaryOrder.order.senderAddress;
      if (filledOrder.order.userSession != address(0)) {
        filledOrderSigner = _validateUserOrder(filledOrder.order);
        if (filledOrderSigner == address(0)) revert InvalidSession();
      }
      if (complimentaryOrder.order.userSession != address(0)) {
        complimentaryOrderSigner = _validateUserOrder(complimentaryOrder.order);
        if (complimentaryOrderSigner == address(0)) revert InvalidSession();
      }
      (bytes32 filledOrderDigest, bytes32 complimentaryOrderDigest, bytes32 settlementDigest) = OrderValidationLib
        .checkOrderInfo(
          filledOrder.order,
          complimentaryOrder.order,
          filledOrderSigner,
          complimentaryOrderSigner,
          msg.sender,
          filledAmount,
          filledPrice,
          msg.sender,
          instrumentsLength,
          historyTimestamp
        );

      _fillOrder(filledOrderDigest, filledOrder.order.amount, filledAmount);
      _fillSettlement(
        filledOrderDigest,
        complimentaryOrderDigest,
        settlementDigest,
        filledOrder.order.orderId,
        complimentaryOrder.order.orderId
      );
    }
    // Paying execution fee to matcher
    {
      address filledOrderCollateral = fullPrices.collateralPrices[filledOrder.collateralIndex].collateral;
      filledOrder.order.matcherFee = (filledOrder.order.matcherFee * filledAmount) / filledOrder.order.amount;
      int256 filledOrderMatcherFee = int256(
        (filledOrder.order.matcherFee * _UINT_COLLATERAL_PRECISION) /
          fullPrices.collateralPrices[filledOrder.collateralIndex].price
      );
      _setBalance(
        filledOrder.order.senderAddress,
        filledOrderCollateral,
        _getBalance(filledOrder.order.senderAddress, filledOrderCollateral) - filledOrderMatcherFee
      );
      _setBalance(
        filledOrder.order.matcherAddress,
        filledOrderCollateral,
        _getBalance(filledOrder.order.matcherAddress, filledOrderCollateral) + filledOrderMatcherFee
      );
    }

    uint256 index = filledOrder.order.instrumentIndex;
    PositionInfo storage userData = _positionInfo[index][filledOrder.order.senderAddress];
    int256 amount = filledOrder.order.side == 0 ? -int256(filledAmount) : int256(filledAmount);
    int256 soLevel_ = soLevel;

    _changePosition(
      index,
      filledOrder.order.senderAddress,
      userData,
      filledOrder.collateralIndex,
      amount,
      int256(filledPrice),
      soLevel_,
      filledOrder.order.leverage,
      fullPrices,
      historyTimestamp,
      historySearchHint
    );

    emit NewTrade(
      index,
      filledOrder.order.senderAddress,
      complimentaryOrder.order.senderAddress,
      filledPrice,
      filledAmount
    );
  }

  function _fillOrder(bytes32 orderDigest, uint256 orderAmount, uint256 filledAmount) internal {
    uint256 newFilledAmount = filledAmounts[orderDigest] + filledAmount;
    if (newFilledAmount > orderAmount) revert OrderIsAlreadyFilled();

    filledAmounts[orderDigest] = newFilledAmount;
  }

  function _fillSettlement(
    bytes32 orderDigest,
    bytes32 complimentaryDigest,
    bytes32 settlementId,
    uint256 orderId,
    uint256 complimentaryId
  ) internal {
    bytes32 storedComplimentaryDigest = filledSettlements[settlementId];
    bool closed;
    if (storedComplimentaryDigest == bytes32(0)) {
      filledSettlements[settlementId] = orderDigest;
      totalOpenedOrders++;
    } else {
      if (storedComplimentaryDigest != complimentaryDigest) revert SettlementMismatch();
      totalSettledOrders++;
      closed = true;
    }
    emit OrderSettled(settlementId, orderId, complimentaryId, closed);
  }

  function collectFr(
    address account,
    FullPrices calldata fullPrices,
    uint256 collateralIndex,
    uint256 historyTimestamp,
    uint256 historySearchHint
  ) external onlyRole(MATCHER_ROLE) {
    uint256[] memory indices = _activeInstruments[account].values();
    uint256 len = indices.length;
    for (uint256 i = 0; i < len; ++i) {
      _collectFr(indices[i], account, fullPrices, collateralIndex, historyTimestamp, historySearchHint);
    }
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
    (int256 frCurrent, int256 staticFee) = getAccountFR(account, index, historyTimestamp, historySearchHint);
    if (frCurrent == 0) return;
    address collateral = fullPrices.collateralPrices[collateralIndex].collateral;
    int256 collateralPrice = int256(fullPrices.collateralPrices[collateralIndex].price);
    int256 posAvgPrice = positionInfo.positionAvgPrice;
    int256 collateralFee = (frCurrent * posAvgPrice * _COLLATERAL_PRECISION) / collateralPrice / _INT_PRECISION;
    int256 staticCollateralFee;
    if (staticFee != 0) {
      address staticFrAccount = staticFundingRateAccount;
      staticCollateralFee = (staticFee * posAvgPrice * _COLLATERAL_PRECISION) / collateralPrice / _INT_PRECISION;
      _setBalance(staticFrAccount, collateral, _getBalance(staticFrAccount, collateral) + staticCollateralFee);
    }
    address frAccount = fundingRateAccount;
    _setBalance(frAccount, collateral, _getBalance(frAccount, collateral) - collateralFee - staticCollateralFee);
    int256 newBalance = _getBalance(account, collateral) + collateralFee;
    _setBalance(account, collateral, newBalance);
    positionInfo.frAccumulated = 0;
    (positionInfo.positionLongFRStored, positionInfo.positionShortFRStored) = getTotalFR(
      index,
      historyTimestamp,
      historySearchHint
    );
    positionInfo.positionLastUpdate = uint32(historyTimestamp);
    emit FrCollected(index, account, collateral, newBalance, staticCollateralFee);
  }

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
    (realizedFRCollateral, ) = getAccountFR(positionOwner, index, historyTimestamp, historySearchHint);
    realizedFRCollateral = (realizedFRCollateral * posData.positionAvgPrice) / _INT_PRECISION;
    realizedPNL = getPNL(positionOwner, index, price);
    _setBalance(
      positionOwner,
      collateral,
      _getBalance(positionOwner, collateral) +
        ((realizedFRCollateral + realizedPNL) * _COLLATERAL_PRECISION) /
        collateralPrice
    );
    address frAccount = fundingRateAccount;
    _setBalance(
      frAccount,
      collateral,
      _getBalance(frAccount, collateral) - (realizedFRCollateral * _COLLATERAL_PRECISION) / collateralPrice
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
    (int256 frAccumulated, ) = getAccountFR(positionOwner, index, historyTimestamp, historySearchHint);
    posData.frAccumulated = int112(frAccumulated);
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
    (int256 frCurrent, ) = getAccountFR(positionOwner, index, historyTimestamp, historySearchHint);

    //  In this case, amount and oldPosition would have different signs
    realizedFRCollateral = (frCurrent * posData.positionAvgPrice * -1 * amount) / oldPosition / _INT_PRECISION;
    realizedPNL = (getPNL(positionOwner, index, price) * amount * -1) / oldPosition;

    _setBalance(
      positionOwner,
      collateral,
      _getBalance(positionOwner, collateral) +
        ((realizedFRCollateral + realizedPNL) * _COLLATERAL_PRECISION) /
        collateralPrice
    );
    address frAccount = fundingRateAccount;
    _setBalance(
      frAccount,
      collateral,
      _getBalance(frAccount, collateral) - (realizedFRCollateral * _COLLATERAL_PRECISION) / collateralPrice
    );
    posData.frAccumulated = int112((frCurrent * newPosition) / oldPosition);
  }

  function _validateUserOrder(Order memory order) internal returns (address) {
    return sessionManager.validateUserOrder(order);
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

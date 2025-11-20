"""
CoinDCX P&L Report Generator - Multi-User Strategy Report
Generate consolidated trade reports for all active subscribers of a strategy

Usage:
    python coindcx_pnl_report.py

Or in Google Colab:
    Upload this file and run it
"""

import hmac
import hashlib
import json
import time
import requests
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
# =============================================================================
# CONFIGURATION
# =============================================================================

# Strategy Information
STRATEGY_ID = "cmh7lyx0y0000p91hb96tpbl6"
STRATEGY_NAME = "ETH_USDT Strategy"
PAIR = "B-ETH_USDT"
DAYS_BACK = 30  # How many days of history to fetch
MARGIN_CURRENCIES = ["USDT", "INR"]

# Commission settings
COMMISSION_RATE = 0.0005  # 0.05%
GST_RATE = 0.18  # 18%

# Active subscribers data (API credentials from database)
# Format: userId|capital|riskPerTrade|leverage|marginCurrency|apiKey|apiSecret
SUBSCRIBERS_DATA = """
cmhx1248m000jp9u7czpfr9cd|10000|0.1|15|USDT|64968a046234b7af7be1075f1b257d62541e31f6e3ed6228|849c276846439b769baab2db1ea1f2cf0bd1cdf9f8e33abdca045a55f9eef815
cmhyiwbmh001hp9r0hqlncbxs|25000|0.1||USDT|053c1192296f61b6a01df1f1a05f6f1fb7f8f1245df3de8c|253e72e45d2c4eceebc026c0303ebc9ed4eb86406c75aea6fdd90838f7c6de26
cmh4tn83h0004p9msgz8ioznj|10000|0.1||INR|6e7b44de6340ce17fae6f59e2c3878826a9d04d6937ac3d7|253706d54d6ff242541aa5fac405e16a1190661278ce816ae986c252e55ccd91
cmhvsipiq0000p98lwuocr22m|10000|0.1||USDT|e338b2e196351ea9bd4861ff0d74804f1f7ca8bb17eb0efa|299057f4e03e223041ddc002d3ca6de20c4a705c6696a2f3e5a3774443283700
cmh8wfp07000dp91hon9dxg96|10000|0.1||INR|7c60d56c1d7010c39aa082ce9842328ade7adf2923f2714e|93f7d550237ef90de95b18fb68d44343a52d7f45b89f8a9c1e4823fb4704ccef
cmha60v9u000ip91h1runmamz|10000|0.1||INR|53a043a25f27e59b02812095cbc262a137daa989a8b672d6|1292b3345e207160442b6691d15358fcd1e90a444533a559d34ff3eae69c5b31
cmhixqnap0008p9vnja4x0s5u|10000|0.1||USDT|faeaf09e08c7c37f34ec8aecd9f789a4a7b39bff578c7a40|8c156300a8869d0f1121d8c41aff37dddf45caac0755975a9bd14d6f96b13138
cmhbwlokr0000p93z4zwc5qub|10000|0.1||INR|48af2e0ec21ec58ff2c5557ba5311ee35e9b496cadeabf15|0b634314176825205c400f426a3f7d3c071b917d8381050171069d7c3330917e
cmhdb8pzr0002p9m9mt1om1xt|10000|0.1||INR|28eea960a4be1ed7b46ff33365acdc597d67e34e60b9fbdd|71f7753afb988e00e8af2b82c3050fa6a84419d57e7b0f5f4c812fe4482d3091
cmhdbb4gk0003p9m90m6xujnv|10000|0.1||INR|d120b8715e67577e3322d678c9da73aa17c44913d60bb330|400b7b06f6a8232f9e11e4f3fab517b7c487e9c87b0acf1c74565e7f48dc9508
cmhjdyqzh0000p93fdjkucqy7|10000|0.1||USDT|01b97e2dd9b6c17493808ccb631e7506a5ddc1068e9c75cf|c82ef54fb10f16d27690f27eb370707111df3eca0777c60841275bbff6a5a72b
cmhkjlu3t000dp93fmbms6eux|10000|0.1||USDT|83e0ead812a86e1deb6e01c79eb85044272cf27c0c8916d7|a4e515ae60d67a6b056ef4f6a510133ee69ba06dbe4948c9f54cc3e6f0926a9d
cmhdm7wav000hp9m99u035dvc|10000|0.1||INR|42d0ef6295275ebaad55e30fea1b7fdd5e9dfadc700cb1bb|cc47b219dcbc646e31f58d0f30f578270efd6a9ae6eab38b82013a6120bc432b
cmhltpl7u000lp93f238oto99|10000|0.1||USDT|a0f09c829b4a986954dda76d3c9df723b305c02452f6a464|61326fa40e152416105317759fee97ca02412f504ce66e8b69e6e1b60bfefdb5
cmhm02jt2000rp93fr5hqb7eg|10000|0.1||USDT|80d42a8b40801e92d32e72d868a1d1f62604c1ff2d143b6a|1fb9cb0b607f494ee3cdf854f8210bf141033ade2ffe1e4a9e415fa42c52df4a
cmhpy0s5u0010p9b1splf85eu|10000|0.1||USDT|af27a39b721b24e3926835a130c28dffbc3aff927b105212|01be8fbf4907e66dae3022b16513d91a1f53ddc843d79cd6bd0b1182d141ce1d
cmhonzttu0011p94b78yxviht|5000|0.1|15|USDT|a43d546c01c3162a72101d90cd43b382c3c0674547caf2f3|e84164d7e8e1f6810ed4425c020729d0abeec4775eb6fc1c1dcc75fb1465d924
cmhommtyt000wp94baqi0fnwc|10000|0.1||USDT|5309b09b6b485529df9e6b08ac8ba13724cae8baeae4e3c3|76d5d6b240c8dae0f6d187e45ffa404101bc17c7fb4ec11b3d0738f714e4dc0f
cmhxhdc72000cp9r04kdpwt0a|19000|0.1||USDT|9832fdbcc0e6b1018c65b0c706edbd3af8a71823b167af5f|09a5eec37bc1ba48686f22f96f9ddc27f50a09c3bb093e2f97100f7e87c1481e
cmi1lcqna000lp9jb8o47vppd|20000|0.1||USDT|abadbe20de6ec60b8b799b8f7c9a3c2c10ee81918453bcc6|6ae934ff7f71b47195178d2012a9890a219b2a5cea495fda19a5eed3af3f8501
""".strip()

# =============================================================================
# COINDCX API CLIENT
# =============================================================================

class CoinDCXClient:
    def __init__(self, key: str, secret: str):
        self.api_key = key
        self.api_secret = secret.encode('utf-8')
        self.base_url = "https://api.coindcx.com"

    def _sign(self, data: str) -> str:
        return hmac.new(self.api_secret, data.encode(), hashlib.sha256).hexdigest()

    def _make_request(self, method: str, endpoint: str, payload: Optional[Dict[str, Any]] = None) -> Any:
        url = self.base_url + endpoint
        if payload is None:
            payload = {}
        payload['timestamp'] = int(time.time() * 1000)
        json_body = json.dumps(payload, separators=(',', ':'))
        signature = self._sign(json_body)

        headers = {
            'Content-Type': 'application/json',
            'X-AUTH-APIKEY': self.api_key,
            'X-AUTH-SIGNATURE': signature
        }

        response = requests.request(method.upper(), url, data=json_body, headers=headers)
        response.raise_for_status()
        return response.json()

    def list_orders(self, status: str, side: str, page: int = 1, size: int = 100,
                    margin_currency_short_name: List[str] = ["USDT"]) -> List[Dict[str, Any]]:
        payload = {
            "status": status,
            "side": side,
            "page": page,
            "size": size,
            "margin_currency_short_name": margin_currency_short_name
        }
        return self._make_request('POST', '/exchange/v1/derivatives/futures/orders', payload)

# =============================================================================
# SUBSCRIBER MANAGEMENT
# =============================================================================

def parse_subscribers() -> List[Dict]:
    """Parse subscriber data"""

    subscribers = []

    for line in SUBSCRIBERS_DATA.split('\n'):
        if not line.strip():
            continue

        parts = line.split('|')
        if len(parts) != 7:
            continue

        user_id, capital, risk, leverage, margin_curr, api_key, api_secret = parts

        if not api_key or not api_secret:
            print(f"   ⚠️  Missing credentials for user {user_id[:12]}...")
            continue

        subscribers.append({
            'user_id': user_id,
            'capital': float(capital) if capital else 10000,
            'risk_per_trade': float(risk) if risk else 0.1,
            'leverage': int(leverage) if leverage else 10,
            'margin_currency': margin_curr if margin_curr else 'USDT',
            'api_key': api_key,
            'api_secret': api_secret
        })

    return subscribers

# =============================================================================
# REPORT GENERATION
# =============================================================================

def fetch_all_trades(client: CoinDCXClient, pair: str, days_back: int,
                     margin_currencies: list, user_id: str) -> List[Dict]:
    """Fetch all platform trades for a user (filtered by client_order_id)"""

    end_date = datetime.now()
    start_date = end_date - timedelta(days=days_back)
    from_date = start_date.strftime('%Y-%m-%d')
    to_date = end_date.strftime('%Y-%m-%d')

    all_trades = []
    page = 1

    while True:
        try:
            trades = client.get_trades(
                from_date=from_date,
                to_date=to_date,
                page=page,
                size=100,
                pair=pair,
                margin_currency_short_name=margin_currencies
            )

            if not trades:
                break

            # Filter for platform trades (xc_ or xcoin_ prefix)
            platform_trades = [
                t for t in trades
                if t.get('client_order_id') and
                   ('xc_' in t.get('client_order_id', '').lower() or
                    'xcoin_' in t.get('client_order_id', '').lower())
            ]

            all_trades.extend(platform_trades)

            if len(trades) < 100:
                break

            page += 1
            time.sleep(0.2)

        except Exception as e:
            print(f"      ❌ Error fetching page {page}: {e}")
            break

    return all_trades


def match_entry_exit_trades(trades: List[Dict]) -> List[Dict]:
    """Match entry and exit orders to form complete trades"""

    entries = []
    exits = []

    for trade in trades:
        order_id = trade.get('client_order_id', '').lower()

        if '_en' in order_id:
            entries.append(trade)
        elif '_ex' in order_id:
            exits.append(trade)

    # Match entries with exits
    matched = []
    used_exits = set()

    entries.sort(key=lambda x: x.get('created_at', ''))
    exits.sort(key=lambda x: x.get('created_at', ''))

    for entry in entries:
        entry_time = entry.get('created_at')
        entry_side = entry.get('side', '').lower()
        expected_exit_side = 'sell' if entry_side == 'buy' else 'buy'

        for i, exit_trade in enumerate(exits):
            if i in used_exits:
                continue

            exit_time = exit_trade.get('created_at')
            exit_side = exit_trade.get('side', '').lower()

            if exit_time > entry_time and exit_side == expected_exit_side:
                matched.append({'entry': entry, 'exit': exit_trade})
                used_exits.add(i)
                break

    return matched


def calculate_pnl(matched_trades: List[Dict], commission_rate: float,
                  gst_rate: float, user_id: str) -> pd.DataFrame:
    """Calculate P&L for matched trades"""

    results = []
    total_commission_rate = commission_rate * (1 + gst_rate)

    for match in matched_trades:
        entry = match['entry']
        exit_trade = match['exit']

        entry_price = float(entry.get('price', 0))
        entry_qty = float(entry.get('quantity', 0))
        entry_side = entry.get('side', '').lower()

        exit_price = float(exit_trade.get('price', 0))
        exit_qty = float(exit_trade.get('quantity', 0))

        # Calculate P&L
        if entry_side == 'buy':
            gross_pnl = (exit_price - entry_price) * exit_qty
        else:
            gross_pnl = (entry_price - exit_price) * exit_qty

        # Commission
        entry_commission = entry_price * entry_qty * total_commission_rate
        exit_commission = exit_price * exit_qty * total_commission_rate
        total_commission = entry_commission + exit_commission

        net_pnl = gross_pnl - total_commission
        pnl_pct = (net_pnl / (entry_price * entry_qty) * 100) if (entry_price * entry_qty) > 0 else 0

        results.append({
            'User ID': user_id,
            'Entry Time': entry.get('created_at'),
            'Exit Time': exit_trade.get('created_at'),
            'Position': 'LONG' if entry_side == 'buy' else 'SHORT',
            'Entry Price': entry_price,
            'Exit Price': exit_price,
            'Quantity': exit_qty,
            'Gross P&L': round(gross_pnl, 2),
            'Commission': round(total_commission, 2),
            'Net P&L': round(net_pnl, 2),
            'P&L %': round(pnl_pct, 2),
            'Entry Order ID': entry.get('client_order_id'),
            'Exit Order ID': exit_trade.get('client_order_id')
        })

    return pd.DataFrame(results)


def calculate_metrics(df: pd.DataFrame) -> Dict:
    """Calculate performance metrics"""

    if df.empty:
        return {"error": "No trades to analyze"}

    total_trades = len(df)
    wins = df[df['Net P&L'] > 0]
    losses = df[df['Net P&L'] < 0]

    win_rate = len(wins) / total_trades if total_trades > 0 else 0
    total_wins = wins['Net P&L'].sum()
    total_losses = abs(losses['Net P&L'].sum())
    profit_factor = total_wins / total_losses if total_losses > 0 else float('inf')

    total_pnl = df['Net P&L'].sum()

    # Max drawdown
    cumulative = df['Net P&L'].cumsum()
    running_max = cumulative.cummax()
    drawdown = running_max - cumulative
    max_dd = drawdown.max()

    return {
        'Total Trades': total_trades,
        'Winning Trades': len(wins),
        'Losing Trades': len(losses),
        'Win Rate': f"{win_rate * 100:.2f}%",
        'Profit Factor': f"{profit_factor:.2f}" if profit_factor != float('inf') else '∞',
        'Total P&L': f"${total_pnl:.2f}",
        'Average Win': f"${wins['Net P&L'].mean():.2f}" if not wins.empty else "$0.00",
        'Average Loss': f"${losses['Net P&L'].mean():.2f}" if not losses.empty else "$0.00",
        'Largest Win': f"${df['Net P&L'].max():.2f}",
        'Largest Loss': f"${df['Net P&L'].min():.2f}",
        'Max Drawdown': f"${max_dd:.2f}",
        'Total Commission': f"${df['Commission'].sum():.2f}"
    }


def main():
    """Main execution"""

    print("\n" + "="*80)
    print(f"📊 CoinDCX Multi-User Strategy Report Generator")
    print(f"   Strategy: {STRATEGY_NAME} ({STRATEGY_ID})")
    print("="*80 + "\n")

    # Parse subscribers
    print("📋 Loading subscriber credentials...")
    subscribers = parse_subscribers()
    print(f"   ✅ Successfully loaded {len(subscribers)} active subscribers\n")

    if not subscribers:
        print("❌ No valid subscribers found!")
        return

    # Process each subscriber
    all_trades_list = []
    user_summaries = []

    for idx, subscriber in enumerate(subscribers, 1):
        user_id = subscriber['user_id']
        short_id = user_id[:12] + "..."

        print(f"\n{'='*80}")
        print(f"[{idx}/{len(subscribers)}] Processing User: {short_id}")
        print(f"   Capital: ${subscriber['capital']:,.2f} | "
              f"Risk: {subscriber['risk_per_trade']*100}% | "
              f"Margin: {subscriber['margin_currency']}")
        print(f"{'='*80}")

        # Initialize client
        client = CoinDCXClient(subscriber['api_key'], subscriber['api_secret'])

        # Fetch trades
        print(f"   📥 Fetching trades from last {DAYS_BACK} days...")
        all_trades = fetch_all_trades(
            client, PAIR, DAYS_BACK,
            [subscriber['margin_currency']],
            user_id
        )

        if not all_trades:
            print(f"   ℹ️  No platform trades found for this user")
            user_summaries.append({
                'User ID': short_id,
                'Total Trades': 0,
                'Net P&L': '$0.00',
                'Win Rate': '0%',
                'Status': 'No trades'
            })
            continue

        print(f"   ✅ Found {len(all_trades)} platform trades")

        # Match trades
        print(f"   🔄 Matching entry/exit orders...")
        matched_trades = match_entry_exit_trades(all_trades)
        print(f"   ✅ Matched {len(matched_trades)} complete trade pairs")

        if not matched_trades:
            print(f"   ⚠️  No complete trade pairs found")
            user_summaries.append({
                'User ID': short_id,
                'Total Trades': 0,
                'Net P&L': '$0.00',
                'Win Rate': '0%',
                'Status': 'No matched pairs'
            })
            continue

        # Calculate P&L
        print(f"   💰 Calculating P&L...")
        trades_df = calculate_pnl(matched_trades, COMMISSION_RATE, GST_RATE, short_id)
        all_trades_list.append(trades_df)

        # User metrics
        metrics = calculate_metrics(trades_df)
        user_summaries.append({
            'User ID': short_id,
            'Total Trades': metrics['Total Trades'],
            'Winning Trades': metrics['Winning Trades'],
            'Losing Trades': metrics['Losing Trades'],
            'Win Rate': metrics['Win Rate'],
            'Net P&L': metrics['Total P&L'],
            'Profit Factor': metrics['Profit Factor'],
            'Max Drawdown': metrics['Max Drawdown']
        })

        print(f"   ✅ User Summary: {metrics['Total Trades']} trades | "
              f"P&L: {metrics['Total P&L']} | Win Rate: {metrics['Win Rate']}")

    # Consolidate all trades
    print(f"\n{'='*80}")
    print("📊 GENERATING CONSOLIDATED REPORT")
    print(f"{'='*80}\n")

    if not all_trades_list:
        print("❌ No trades found across all users!")
        return

    consolidated_df = pd.concat(all_trades_list, ignore_index=True)
    overall_metrics = calculate_metrics(consolidated_df)

    # Display overall summary
    print("="*80)
    print("📈 OVERALL STRATEGY PERFORMANCE")
    print("="*80)
    for key, value in overall_metrics.items():
        print(f"{key:.<40} {value}")
    print("="*80 + "\n")

    # Display user summaries
    print("👥 USER PERFORMANCE SUMMARY")
    print("="*80)
    summary_df = pd.DataFrame(user_summaries)
    print(summary_df.to_string(index=False))
    print("="*80 + "\n")

    # Save reports
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

    # All trades
    trades_filename = f"consolidated_trades_{PAIR}_{timestamp}.csv"
    consolidated_df.to_csv(trades_filename, index=False)
    print(f"✅ All trades saved to: {trades_filename}")

    # User summaries
    summary_filename = f"user_summaries_{PAIR}_{timestamp}.csv"
    summary_df.to_csv(summary_filename, index=False)
    print(f"✅ User summaries saved to: {summary_filename}")

    # Overall metrics
    metrics_filename = f"overall_metrics_{PAIR}_{timestamp}.csv"
    pd.DataFrame([overall_metrics]).to_csv(metrics_filename, index=False)
    print(f"✅ Overall metrics saved to: {metrics_filename}")

    # Daily breakdown (across all users)
    consolidated_df['Date'] = pd.to_datetime(consolidated_df['Entry Time']).dt.date
    daily = consolidated_df.groupby('Date')['Net P&L'].agg(['sum', 'count'])
    daily.columns = ['Daily P&L', 'Trades']
    daily['Cumulative P&L'] = daily['Daily P&L'].cumsum()

    daily_filename = f"daily_pnl_{PAIR}_{timestamp}.csv"
    daily.to_csv(daily_filename)
    print(f"✅ Daily P&L saved to: {daily_filename}")

    print("\n✨ Consolidated report generation complete!\n")
    print(f"📊 Total Subscribers Processed: {len(subscribers)}")
    print(f"📈 Total Trades Across All Users: {len(consolidated_df)}")
    print(f"💰 Overall Net P&L: {overall_metrics['Total P&L']}")
    print(f"🎯 Overall Win Rate: {overall_metrics['Win Rate']}\n")


if __name__ == "__main__":
    main()




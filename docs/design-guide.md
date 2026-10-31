# アークナイツ編成シミュレーター デザインガイド

> UI/デザインリニューアルの指針。既存の `docs/design.md`（機能・データ設計）を補完し、視覚表現・配色・タイポグラフィ・コンポーネント・アセットの方針を定める。
>
> 最終更新: 2026-10-30 / 対象バージョン: v0.2 → v0.3（リニューアル）

---

## 1. 目的と方針

アークナイツの世界観（近未来SF・鉱石病・「テラ」の荒廃した美しさ）に即したデザインへ刷新する。既存の実装はすでに「黒に近い青灰色の基調＋ロドス島の金（#C4AD70）」という方向性を持っており、これは世界観と整合している。リニューアルでは、この方向性を**トークンとして整理・拡張**し、以下を達成する。

1. **色をトークン化して一元管理**する（現在CSS各所に散在するハードコード色を廃する）。
2. **ダークテーマ（既定）とライトテーマの両対応**を実現する。
3. **多言語（日本語 / 简体中文 / 한국어 / English）で崩れないタイポグラフィ**を整える。
4. **控えめで洗練された動き**と、**WCAG 準拠のアクセシビリティ**を両立する。

### デザイン原則

- **鋭角と直線**: 角丸は原則 `0`（最大でも `2px`）。工業的・軍事的な硬質さを出す。
- **金は「意味を持つ色」**: アクセント（金）は操作可能要素・重要数値・選択状態に限定し、装飾に乱用しない。
- **余白と字間で緊張感を**: 狭い字間の欧文ラベル（`TACTICAL PLANNING`）と、広い余白の和文見出しの対比を軸にする。
- **控えめな動き**: アニメーションは 150–200ms の色・枠線・微移動に限定。派手な演出をしない。
- **透明性**: トークンの意図・マッピングを本ガイドとコードコメントで説明できる状態にする。

---

## 2. 現状の分析（棚卸し）

現行実装の読み取り結果（`css/*.css`、`index.html`、`manifest.json`、`favicon.svg`、`data/operators.json`）に基づく。

### 2.1 現行トークン（`css/base.css` `:root`）

| 現行トークン | 値 | 役割 |
|---|---|---|
| `--color-ink` | `#e9eceb` | 本文 |
| `--color-muted` | `#9ba7a8` | 補足 |
| `--color-base` | `#10171b` | 背景 |
| `--color-panel` | `#182226` | パネル |
| `--color-panel-raised` | `#202c30` | 浮上要素 |
| `--color-border` | `#344246` | 枠線 |
| `--color-accent` | `#c4ad70` | アクセント（金） |
| `--color-accent-strong` | `#e5cf93` | 強調アクセント |
| `--content-width` | `1120px` | コンテンツ幅 |

`color-scheme: dark` が宣言されており、実質ダークテーマのみ。ライトテーマのトークンは未定義。

### 2.2 課題

- **ハードコード色の散在**: `#182226b8`、`#111a1e`、`#ffffff12`、`#c4ad7066`、`#9e615c`、`#e2aaa3`、`#522c2a` 等が `components.css` / `layout.css` / `database.css` に直書きされ、テーマ切替の障壁になっている。
- **レアリティが星（★）表記のみ**で色分けがない。アークナイツはレアリティ色（★6=橙金、★5=黄…）が重要な認知手がかり。
- **フォント**: 本文は `Inter, "Noto Sans JP", "Yu Gothic UI", Meiryo`、見出しは `Georgia, "Yu Mincho"`。韓国語・中国語向けの明示的フォールバックがない。
- **テーマ色**: `manifest.json` と `meta[name=theme-color]` が `#111a22` 固定。
- **ブレークポイント**: `760 / 640 / 480px`（`database.css` に追加で `900px`）。デスクトップファーストの記述順。

---

## 3. デザインテーマ

### 3.1 世界観の解釈

- **背景**: テラの夜／汚染された大地。青みを帯びた「黒に近い青灰」。単色ではなく、かすかなラジアルグラデーション（既存 `body` の `radial-gradient`）で奥行きを出す。
- **前景・情報**: ロドス島の制服・紋章の金。荒廃した世界に残る「秩序と希望」の色として機能させる。
- **危険・警告**: 鉱石病を思わせる暗い赤。派手な原色の赤は避け、くすんだ赤 `#E2AAA3` を基調に。

### 3.2 カラーパレット（ダーク / ライト）

リニューアル後の正準トークンを `--ak-*` プレフィックスで定義する。**既定はダーク**。ライトテーマは `html[data-theme="light"]`（または `@media (prefers-color-scheme: light)` の任意有効化）で上書きする。

#### 3.2.1 ベース / サーフェス / 枠線 / テキスト

| トークン | ダーク（既定） | ライト | 用途 |
|---|---|---|---|
| `--ak-bg` | `#0C1216` | `#EEF1F2` | ページ背景 |
| `--ak-bg-surface` | `#141D22` | `#FFFFFF` | カード・パネル |
| `--ak-bg-raised` | `#1C282E` | `#F4F6F7` | ホバー・浮上要素 |
| `--ak-bg-input` | `#10171B` | `#FFFFFF` | 入力フィールド |
| `--ak-bg-header` | `rgba(12, 18, 22, .86)` | `rgba(238, 241, 242, .88)` | ヘッダー背景（+backdrop-blur） |
| `--ak-border` | `#2E3D44` | `#C6CFD2` | 通常枠線 |
| `--ak-border-subtle` | `#24313A` | `#DFE5E7` | 弱い枠線・区切り |
| `--ak-border-strong` | `#405058` | `#9FB0B5` | 強調枠線 |
| `--ak-text` | `#E7ECEC` | `#1A2326` | 本文 |
| `--ak-text-muted` | `#9AA6A8` | `#5A6A6E` | 補足テキスト |
| `--ak-text-faint` | `#6E7C80` | `#849297` | 弱い補足・無効状態 |

#### 3.2.2 アクセント（ロドス島の金）

| トークン | ダーク | ライト | 用途 |
|---|---|---|---|
| `--ak-accent` | `#C4AD70` | `#A8892E` | 主アクセント（ボタン背景・選択枠） |
| `--ak-accent-strong` | `#E8D49B` | `#6E5A1C` | ホバー・フォーカス・強調テキスト |
| `--ak-accent-faint` | `rgba(196, 173, 112, .16)` | `rgba(168, 137, 46, .12)` | 薄いアクセント枠・背景 |
| `--ak-on-accent` | `#10171B` | `#1A2326` | アクセント上の文字 |

> ライトテーマのアクセントは、白背景上で本文・小サイズ文字に使えるコントラスト（≧4.5:1）を確保するため、より濃い金（`#6E5A1C` 系）を「テキスト用途」として分離する。

#### 3.2.3 セマンティックカラー（状態・意味）

| トークン | ダーク | ライト | 用途 |
|---|---|---|---|
| `--ak-success` | `#7FB685` | `#3E7A48` | 成功・所持済み |
| `--ak-warning` | `#D6A55A` | `#9A6B1F` | 注意・未確認データ |
| `--ak-danger` | `#E2AAA3` | `#B5524B` | 危険・削除 |
| `--ak-danger-bg` | `rgba(82, 44, 42, .40)` | `rgba(181, 82, 75, .10)` | 危険領域の背景 |
| `--ak-info` | `#7FB2C9` | `#3A7A9A` | 情報・案内 |

### 3.3 レアリティカラー

現在は `★n` の文字のみ。アークナイツのレアリティ色を付与し、色と文字（★数）の両方で判別可能にする（色だけに依存しない）。

| レアリティ | ダーク（文字・枠） | ライト（文字・枠） | 補足 |
|---|---|---|---|
| ★6 | `#F5A623` | `#B36800` | 橙金 |
| ★5 | `#FFD54F` | `#9A7B00` | 黄 |
| ★4 | `#CE93D8` | `#7B2E8C` | 紫 |
| ★3 | `#64B5F6` | `#1E62B8` | 青 |
| ★2 | `#81C784` | `#35703A` | 緑 |
| ★1 | `#B0BEC5` | `#6B757A` | 灰 |

> レアリティ色は小さな文字（9–12px）に使うため、ライトテーマでは白背景で AA（4.5:1）を満たす濃色を採用する。実装時はコントラスト計測ツールで再検証し、必要に応じ微調整する。

### 3.4 職業（クラス）カラー（任意・参照用）

クラスアイコンや職業フィルターの補助色として導入を検討する。値はコミュニティで広く使われる参照色であり、公式資料と突き合わせてから採用すること。

| 職業 | 色 | 職業 | 色 |
|---|---|---|---|
| 前衛 Guard | `#D9534F` | 重装 Defender | `#6FA8B0` |
| 狙撃 Sniper | `#4E89D4` | 医療 Medic | `#5CB87A` |
| 術師 Caster | `#9C6BD4` | 特殊 Specialist | `#7A6FB0` |
| 先鋒 Vanguard | `#A8C24E` | 補助 Supporter | `#D4A84F` |

> 初期実装では必須としない。レアリティ色の導入を優先し、クラス色はアイコン導入と同時に検討する。

### 3.5 テーマ切替の実装方針

- トークンは `:root`（ダーク既定）に定義し、`html[data-theme="light"]` で上書きする。
- `:root { color-scheme: dark }` → `html[data-theme="light"] { color-scheme: light }` とし、ネイティブのフォームコントロール色も追従させる。
- 設定画面に「テーマ」切替（ダーク / ライト / 端末設定に従う）を追加する。既定はダーク。
- 選択は `arknights-team-builder:prefs:v1` に保存（既存の表示設定キーに同居）。
- `prefers-color-scheme` への自動追従は任意オプションとし、明示切替を優先する（JS側で `data-theme` を設定）。
- `meta[name=theme-color]` と `manifest.json` の `theme_color` / `background_color` は、テーマに応じて `--ak-bg-header` / `--ak-bg` と一致させる（JSで `meta` を動的更新）。

### 3.6 タイポグラフィ

#### 3.6.1 フォントスタック

多言語（ja / zh-CN / ko / en）を単一スタックでカバーする。外部Webフォントに依存しない（既存方針「ネットワークは静的ファイル初回取得以外に不要」を維持）。

```css
:root {
  /* 本文・UI（ラテン → 和文 → 簡体中文 → 韓国語 → システム） */
  --font-sans: "Inter", "Noto Sans JP", "Noto Sans SC", "Noto Sans KR",
               "Yu Gothic UI", "Hiragino Kaku Gothic ProN", "PingFang SC",
               "Malgun Gothic", "Meiryo", sans-serif;

  /* 見出し・数値（引き締まった欧文＋重みのある和文） */
  --font-display: "Rajdhani", "Oswald", "Noto Sans JP", "Noto Sans SC",
                  "Noto Sans KR", "Yu Gothic UI", "Meiryo", sans-serif;

  /* 等幅（ID・コード・JSON表示） */
  --font-mono: "JetBrains Mono", "SFMono-Regular", "Consolas",
               "Liberation Mono", monospace;
}
```

- **本文**: 現行の `Inter + Noto Sans JP` を踏襲し、SC/KR のフォールバックを追加。`16px / 1.7` を基準。
- **見出し（display）**: 現行の `Georgia / Yu Mincho`（セリフ）から、**引き締まったジオメトリック・サンセリフ**（`Rajdhani` / `Oswald`、未導入なら `Noto Sans JP` の Bold）へ変更する。軍事的・技術的な印象を優先。欧文は大文字＋字間広めで統一。
- **数値（スコア・登録数・レアリティ）**: 桁揃えのため `font-feature-settings: "tnum" 1, "lnum" 1` を適用（等幅数字）。
- **文字サイズ階調**: `10 / 11 / 12 / 13 / 14 / 16 / 19 / 22 / 26 / clamp(28, 4vw, 38)` を基本とする（現行踏襲）。

#### 3.6.2 字間・行間のルール

- **欧文ラベル（eyebrow / kicker / ナビ）**: `letter-spacing: 0.16em–0.19em`、大文字。現行の `0.19em` を維持。
- **和文・CJK 本文・見出し**: `letter-spacing: 0` を基本（過剰な字間はCJKの可読性を損なう）。見出しのみ `0.02em–0.04em` の微調整を許容。
- **行間**: 本文 `1.7–1.8`、補足 `1.6–1.7`。現行踏襲。
- **フォント読み込み**: 外部依存を避けるため、`Rajdhani` 等は「サブセット化した woff2 を自前配布」する場合のみ導入する。未導入でもシステムフォントで成立するスタックにする。

---

## 4. レイアウト方針

### 4.1 全体構造

```
┌──────────────────────────────────────────┐
│ ヘッダー（sticky・86px・ブレ）           │
│  [ブランド] [ナビ] [リージョン] [設定]    │
├──────────────────────────────────────────┤
│ メイン .app-shell（max-width: 1120px）   │
│  [ページ見出し / eyebrow + h1 + status]   │
│  [ビュー（単一表示）]                     │
├──────────────────────────────────────────┤
│ フッター [ブランド] [タグライン]          │
└──────────────────────────────────────────┘
```

- **ヘッダー**: `position: sticky; top: 0; z-index` とし、`--ak-bg-header`＋`backdrop-filter: blur(8px)`。ブランド左、ナビ中央（`flex:1`）、リージョン選択と設定右。
- **ナビゲーション**: リンクは `min-height: 44px`（タッチ対象）を維持。現在地は `aria-current="page"` と `--ak-accent-strong` で示す。選択中の下線（1px）を付けて色だけに依存しない。
- **メイン**: 単一カラム。ビュー切替は `hidden` 属性のまま（アニメーションで状態を増やさない）。見出しへフォーカス移動。
- **フッター**: 2行（ブランド / タグライン）。`--ak-text-faint` で控えめに。

### 4.2 スペーシングスケール

4px ベースの一貫した間隔を使う。既存の `padding` 値をこのスケールへ寄せる。

```
--space-1: 4px   --space-2: 8px   --space-3: 12px  --space-4: 16px
--space-5: 20px  --space-6: 24px  --space-7: 32px  --space-8: 40px
--space-9: 48px  --space-10: 64px
```

- カード内余白: `16–20px`（`--space-4`〜`--space-5`）
- セクション間: `32–52px`（`--space-7`〜）
- フィルター/フォームのラベルと入力間: `7–8px`（`--space-2`）

### 4.3 カード / リスト / フォームのパターン

- **カード**: 枠線 `1px solid var(--ak-border)`、背景 `--ak-bg-surface`、角丸 `0`。ホバーで `border-color: var(--ak-accent)` ＋ `background: var(--ak-bg-raised)` ＋ `translateY(-2px)`（現行の `.operator-card` / `.database-card` 踏襲）。
- **リスト（提案メンバー・育成ランキング）**: 枠線付きの行カード。ヘッダー（順位・名前・スコア）→ 本文（理由）→ メトリクス（等幅数値）の縦積み。
- **フォーム**: ラベルは入力の上（`display: grid; gap: 7px`）。入力・セレクトは `min-height: 44px`、`border-radius: 0`、背景 `--ak-bg-input`。フィルター群は枠線付きのパネルにまとめる（現行踏襲）。
- **状態表示**: 空状態・エラー・読込中は「枠線破線＋補足色」で区別。所持済みは左端 3px のアクセント線＋色（`border-left: 3px solid var(--ak-accent)`）で、色だけでなく構造でも示す。

### 4.4 モバイルファースト

- **記述順の見直し**: 現在はデスクトップ基準＋メディアクエリで縮小。リニューアルでは **モバイル（≤480px）を基準スタイル**とし、`min-width` のメディアクエリで段階的に拡張する方針へ転換する（既存ルールの振る舞いは維持しつつ、追加分から順次適用）。
- **ブレークポイント**: トークン化して統一する。

```css
:root {
  --bp-sm: 480px;
  --bp-md: 640px;
  --bp-lg: 760px;
  --bp-xl: 900px;   /* database の2カラム解消用（既存） */
}
```

- **グリッド段階**: カード列数は `1列（≤480）→ 2列（≤640〜760）→ 3列（>760）`。現行の `operator-grid`（3→2→1）、`database-grid`（2→1）を踏襲。
- **ナビ**: 狭幅では2段（ブランド＋設定を1行目、ナビを横スクロール可能な2行目）。タップ領域 44px を維持（現行踏襲）。
- **フィルター**: 狭幅で `1列` に畳み、検索欄を全幅（`grid-column: 1 / -1`）にする（現行踏襲）。

---

## 5. コンポーネントデザイン

### 5.1 ボタン

| 種別 | スタイル |
|---|---|
| プライマリ | 背景 `--ak-accent`、文字 `--ak-on-accent`、枠線なし。ホバーで `--ak-accent-strong` |
| セカンダリ | 透明背景、枠線 `--ak-border`、文字 `--ak-text`。ホバーで背景 `--ak-bg-raised` |
| デンジャー | 透明背景、枠線/文字 `--ak-danger`。ホバーで背景 `--ak-danger-bg` |
| アイコン | 枠線付き正方形（`44px`）、文字 `--ak-text-muted` |

- 共通: `min-height: 44px`、`padding: 0 18px`、角丸 `0`、`font-weight: 700`。
- 無効: `opacity: .5; cursor: not-allowed` に加え、`aria-disabled` / `disabled` を同期。
- 現行の `.button-primary` / `.button-secondary` / `.button-danger` / `.icon-button` をトークン化して維持。

### 5.2 入力フォーム・セレクトボックス

- `min-height: 44px`、`padding: 0 11–12px`、`border: 1px solid var(--ak-border)`、`border-radius: 0`、背景 `--ak-bg-input`。
- フォーカス: `outline: 2px solid var(--ak-accent-strong); outline-offset: 1px` を入力専用に。セレクトはネイティブ矢印を維持し、`appearance` の無理な上書きをしない（`color-scheme` でテーマ追従）。
- プレースホルダーは `--ak-text-faint`。検索入力は `type="search"`＋既存 `datalist` を維持。

### 5.3 カード

現行の `.operator-card` / `.database-card` を基準に統一する。

- 構造: ヘッダー（レアリティ★＋状態バッジ）→ 名前 → 職業/職分 → 進捗。`display: grid; gap: 10px`。
- 選択/所持: `border-left: 3px solid var(--ak-accent)`（所持）＋バッジ。選択中は `--ak-accent` 枠＋`--ak-bg-raised`。
- ホバー/フォーカス: 枠線色変更＋`translateY(-2px)`。`prefers-reduced-motion` 時は移動を無効化し、枠線・背景のみ。

### 5.4 モーダル / ダイアログ

現状はモーダルを使わず、編集はインラインセクション、削除は設定画面のボタン。**原則として現状のインライン方式を維持**し、モーダルは「不可逆な破壊操作の確認（全データ削除）」などに限定して導入する。

導入時は以下を満たす:

- ネイティブ `<dialog>` を優先（フォーカス管理・Escape閉じを標準で満たす）。
- 背景は `rgba(0,0,0,.5)` のオーバーレイ＋`backdrop-filter: blur(2px)`。
- `aria-modal="true"`、開閉時のフォーカス移動、`role` とラベル（`aria-labelledby`）を同期。
- 破壊操作は文言で取り消せない旨を明示し、確定ボタンはデンジャー色。

### 5.5 アニメーション / トランジション方針

**控えめだが洗練された動き**を原則とする。

| 対象 | 内容 | 時間 |
|---|---|---|
| ホバー（カード・ボタン・リンク） | 色・枠線・背景の変化 | `150–200ms ease` |
| カードの浮上 | `transform: translateY(-2px)` | `180ms ease` |
| ビュー切替 | 不透明度フェード（`hidden` 切替と併用、任意） | `200ms ease` |
| ナビ下線 | 幅・色の変化 | `180ms ease` |

- **`prefers-reduced-motion: reduce` を必須で尊重**する。transform とビュー切替フェードを無効化し、色・枠線の変化のみ残す。
- ページ全体の派手なスライド・バウンス・無限ループは使用しない。
- レイアウトシフトを避けるため、アニメーションは `transform` / `opacity` に限定し、`height` / `top` の遷移を避ける。

### 5.6 アクセシビリティ

- **コントラスト比**: 本文 `--ak-text` と背景 `--ak-bg` は ≧7:1、補足 `--ak-text-muted` は ≧4.5:1（AA）を確保する。ダーク/ライト双方で、主要トークンは下表を目安に実装時に計測・微調整する。

| 組み合わせ（ダーク） | 目安 | 組み合わせ（ライト） | 目安 |
|---|---|---|---|
| `#E7ECEC` / `#0C1216` | ≒15:1 | `#1A2326` / `#EEF1F2` | ≒13:1 |
| `#9AA6A8` / `#0C1216` | ≒7:1 | `#5A6A6E` / `#FFFFFF` | ≒6.5:1 |
| `#C4AD70` / `#0C1216` | ≒8.5:1 | `#6E5A1C` / `#FFFFFF` | ≒6:1 |
| `#10171B` / `#C4AD70` | ≒7:1 | `#1A2326` / `#A8892E` | ≒8:1 |

- **フォーカス表示**: グローバル `:focus-visible { outline: 3px solid var(--ak-accent-strong); outline-offset: 4px; }` を維持（現行踏襲）。ライトテーマでは `--ak-accent-strong` が濃色になるため視認性を確保。
- **タッチ対象**: 操作可能要素は `min-height/min-width: 44px`（現行踏襲）。
- **色に依存しない表現**: レアリティは★数＋色、状態はバッジ文字＋色、所持は枠線（3px）＋色で併記する。
- **見出し階層・ランドマーク**: `header / nav / main / footer` と `aria-labelledby`、`role="status"` + `aria-live="polite"` の既存構造を維持する。
- **`skip-link`**: 既存の「メインコンテンツへ」を維持。

---

## 6. アセット方針

### 6.1 ファビコン

- 現行 `favicon.svg` の菱形＋「RI」モチーフを維持し、配色を新トークンへ更新する。
  - 背景: `--ak-bg-surface`（`#141D22`）
  - 菱形枠: `--ak-accent`（`#C4AD70`）
  - RI文字: `--ak-accent-strong`（`#E8D49B`）
- `assets/favicon.ico` / `favicon.png`（32×32）を SVG から再出力し、`manifest.json` のアイコン配列と整合させる。
- ファビコンは単一（ダーク基調）で両テーマ対応可能。ライトテーマでも金が視認できる配色を選ぶ。

### 6.2 OGP 画像

- `assets/ogp.png`（1200×630）を新配色で再作成する。
  - 背景: ダークの `--ak-bg` 系＋ラジアルグラデーション。
  - 中央: 菱形エンブレム＋「ARKNIGHTS TEAM BUILDER」の欧文ラベル（大文字・広字間）。
  - テキスト: アプリ名とタグライン。**第三者のキャラクター画像・著作物は使用しない**（既存方針）。
- `index.html` の `og:image` / `twitter:image` は公開後に解決できる HTTPS URL（`https://yyiik0220-collab.github.io/arknights-team-builder/assets/ogp.png`）を維持する。

### 6.3 アイコン

- **原則インライン SVG** を採用する。理由: `currentColor` でテーマ色へ自動追従でき、高解像度で、外部依存がない。
- **絵文字は使わない**: プラットフォーム間で描画が異なり、テーマに馴染まない。
- **アイコンフォントは使わない**: 読み込みとアクセシビリティ（スクリーンリーダーへの読み上げ）の扱いが煩雑。
- 必要アイコン（SVGパスを共通モジュール化）: 検索（虫めがね）、絞り込み、星（レアリティ）、設定（歯車）、閉じる（×）、チェック、ダウンロード / アップロード、情報。
- 装飾アイコンには `aria-hidden="true"`、操作アイコンには `role="img"`＋`aria-label` を付与する。

### 6.4 ブランド・ロゴ

- ヘッダーの `.brand-mark`（45°回転した菱形＋「A」）を維持。回転要素の対称性を活かし、`--ak-accent` 枠＋`--ak-accent-strong` 文字で統一する。

---

## 7. マイグレーション・実装手順

既存コードを壊さず段階的にトークン化する。

1. **トークン定義の拡張**（`base.css` `:root`）
   - 既存 `--color-*` を維持したまま、新 `--ak-*` を定義。`--color-*` は `--ak-*` へのエイリアスとして併存させ、段階移行する。
   - ライトテーマ用 `html[data-theme="light"]` ブロックを追加。

2. **ハードコード色の置換**（`components.css` / `layout.css` / `database.css`）
   - `#182226b8` → `--ak-bg-surface`（透過が必要なら `color-mix(in srgb, var(--ak-bg-surface) 72%, transparent)`）
   - `#111a1e` → `--ak-bg-input`
   - `#ffffff12` / `#ffffff18` → `--ak-border-subtle`
   - `#c4ad7066` / `#c4ad7055` → `--ak-accent-faint`
   - `#9e615c` / `#e2aaa3` / `#522c2a` → `--ak-danger` / `--ak-danger-bg`
   - `#202c30` → `--ak-bg-raised`

3. **タイポグラフィ更新**（`base.css` / `layout.css`）
   - `--font-sans` / `--font-display` / `--font-mono` を導入し、`font-family` を置換。
   - 見出しの `Georgia, "Yu Mincho"` → `var(--font-display)`。
   - 数値表示へ `font-feature-settings: "tnum"` を適用。

4. **テーマ切替の実装**（`js` の設定モジュール）
   - 設定画面にテーマ切替を追加し、`prefs` に保存。`data-theme` と `meta[name=theme-color]` を更新。

5. **レアリティ色の導入**（`roster-ui.js` / `database-ui.js`）
   - レアリティ表示に色クラス（例: `.rarity-6`）を付与し、トークンで着色。★数は現状維持。

6. **アニメーションと `prefers-reduced-motion`**
   - 既存トランジションをトークン化し、`@media (prefers-reduced-motion: reduce)` で抑制。

7. **アセット更新**
   - `favicon.svg` / `favicon.png` / `ogp.png` を新配色で再生成。`manifest.json` の `theme_color` を更新。

---

## 8. 検証観点

1. ダーク/ライト両テーマで、本文・補足テキストのコントラスト比をツールで計測し、AA（4.5:1）を満たす。
2. 4言語（ja / zh-CN / ko / en）で文字化け・崩れ・過剰な字間がないことを確認。
3. `480 / 640 / 760 / 900px` の各ブレークポイントで、ナビ・グリッド・フィルター・カードが崩れず、横スクロールを強制しない。
4. タブキーで全操作要素へ到達でき、`focus-visible` が両テーマで視認できる。
5. `prefers-reduced-motion: reduce` 時に transform・フェードが抑制される。
6. テーマ切替を再読込後も維持し、`meta theme-color` と `manifest` が連動する。
7. favicon・OGP が新配色で、公開URL上で 404 にならない（GitHub Pages サブパス配下）。
8. 色分け（レアリティ・所持・危険）が、色覚特性に依存しない表示（★数・バッジ文字・枠線）と併存している。

---

## 9. 付録: 正準トークン一覧（実装用リファレンス）

```css
:root {
  /* テーマ */
  color-scheme: dark;

  /* ベース */
  --ak-bg:            #0C1216;
  --ak-bg-surface:    #141D22;
  --ak-bg-raised:     #1C282E;
  --ak-bg-input:      #10171B;
  --ak-bg-header:     rgba(12, 18, 22, .86);

  /* 枠線 */
  --ak-border:        #2E3D44;
  --ak-border-subtle: #24313A;
  --ak-border-strong: #405058;

  /* テキスト */
  --ak-text:          #E7ECEC;
  --ak-text-muted:    #9AA6A8;
  --ak-text-faint:    #6E7C80;

  /* アクセント */
  --ak-accent:        #C4AD70;
  --ak-accent-strong: #E8D49B;
  --ak-accent-faint:  rgba(196, 173, 112, .16);
  --ak-on-accent:     #10171B;

  /* セマンティック */
  --ak-success:   #7FB685;
  --ak-warning:   #D6A55A;
  --ak-danger:    #E2AAA3;
  --ak-danger-bg: rgba(82, 44, 42, .40);
  --ak-info:      #7FB2C9;

  /* レアリティ */
  --ak-rarity-6: #F5A623;
  --ak-rarity-5: #FFD54F;
  --ak-rarity-4: #CE93D8;
  --ak-rarity-3: #64B5F6;
  --ak-rarity-2: #81C784;
  --ak-rarity-1: #B0BEC5;

  /* レイアウト */
  --content-width: 1120px;
  --bp-sm: 480px;
  --bp-md: 640px;
  --bp-lg: 760px;
  --bp-xl: 900px;

  /* スペーシング */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-7: 32px; --space-8: 40px;
  --space-9: 48px; --space-10: 64px;
}

html[data-theme="light"] {
  color-scheme: light;

  --ak-bg:            #EEF1F2;
  --ak-bg-surface:    #FFFFFF;
  --ak-bg-raised:     #F4F6F7;
  --ak-bg-input:      #FFFFFF;
  --ak-bg-header:     rgba(238, 241, 242, .88);

  --ak-border:        #C6CFD2;
  --ak-border-subtle: #DFE5E7;
  --ak-border-strong: #9FB0B5;

  --ak-text:          #1A2326;
  --ak-text-muted:    #5A6A6E;
  --ak-text-faint:    #849297;

  --ak-accent:        #A8892E;
  --ak-accent-strong: #6E5A1C;
  --ak-accent-faint:  rgba(168, 137, 46, .12);
  --ak-on-accent:     #1A2326;

  --ak-success:   #3E7A48;
  --ak-warning:   #9A6B1F;
  --ak-danger:    #B5524B;
  --ak-danger-bg: rgba(181, 82, 75, .10);
  --ak-info:      #3A7A9A;

  --ak-rarity-6: #B36800;
  --ak-rarity-5: #9A7B00;
  --ak-rarity-4: #7B2E8C;
  --ak-rarity-3: #1E62B8;
  --ak-rarity-2: #35703A;
  --ak-rarity-1: #6B757A;
}
```

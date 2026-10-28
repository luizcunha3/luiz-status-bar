# luiz-status-bar

Um mod de Claude Code que mostra uma barra acima da caixa de texto, com duas colunas:

- **Primeira coluna:** medidores de Contexto (lilás), limite de 5h (verde) e limite de 7d (argila). Cada um tem uma bolinha colorida, uma barra pontilhada e a porcentagem. Os limites só aparecem quando o seu plano informa essas janelas.
- **Segunda coluna:** custo da sessão, tempo do turno (ou do último turno) e número de ferramentas chamadas, um item por linha.

No desktop a barra é desenhada em SVG; no terminal, com blocos de texto. O visual é inspirado no [savvy-progress](https://github.com/johnnyvizz/claude-kit).

## Instalar

Dentro do Claude Code:

```
/plugin marketplace add luizcunha3/luiz-status-bar
/plugin install luiz-status-bar@luiz-status-bar
/reload-plugins
```

Ou pelo terminal:

```sh
claude plugin marketplace add luizcunha3/luiz-status-bar
claude plugin install luiz-status-bar@luiz-status-bar
```

## Atualizar

```sh
claude plugin marketplace update luiz-status-bar
```

## Desenvolver

```sh
claude --plugin-dir ./plugins/luiz-status-bar
claude plugin validate ./plugins/luiz-status-bar
```

## Licença

MIT

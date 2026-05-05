@echo off
title CousinServices — Atualizacao de Dados
color 0A
echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║   CousinServices — Pipeline de Atualizacao v2.0        ║
echo ║   Scraping + Analise Financeira (1 clique)             ║
echo ╚══════════════════════════════════════════════════════════╝
echo.
echo [1/2] Extraindo dados dos leiloeiros...
echo.
call npm run scrape:pw
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ ERRO no scraping. Verifique a conexao com a internet.
    pause
    exit /b 1
)
echo.
echo [2/2] Calculando analise financeira...
echo.
call npm run analise
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ ERRO na analise. Verifique o arquivo leiloes.json.
    pause
    exit /b 1
)
echo.
echo ══════════════════════════════════════════════════════════
echo ✅ Pipeline completo! Dashboard atualizado com dados frescos.
echo    Abra http://localhost:3000 para visualizar.
echo ══════════════════════════════════════════════════════════
echo.
pause

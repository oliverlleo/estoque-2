from playwright.sync_api import sync_playwright
import sys

# Aumenta o limite de caracteres por linha no stdout para evitar quebra de linha nos logs
sys.stdout.reconfigure(line_buffering=True, write_through=True)

def capture_console_logs(page):
    """
    Captura todos os logs do console e os salva em um arquivo.
    """
    logs = []
    page.on("console", lambda msg: logs.append(msg.text))

    # Navega para a página e espera o carregamento completo
    page.goto("http://localhost:8000/index.html")

    # Espera por um elemento chave que indica que o cálculo foi concluído
    try:
        page.wait_for_selector('#kpi-valor-total:not(:text("Carregando..."))', timeout=30000) # 30 segundos
    except Exception as e:
        print(f"Erro ao esperar pelo seletor: {e}", file=sys.stderr)

    # Salva os logs em um arquivo
    with open("debug_log.txt", "w") as f:
        for log in logs:
            f.write(log + '\\n')

    print("Logs de depuração salvos em debug_log.txt")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            capture_console_logs(page)
        finally:
            browser.close()

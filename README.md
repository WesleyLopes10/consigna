# Consigna

Sistema de gestão de avaliações de veículos para consignação.

## Executar

Execute `python3 -m http.server 8000` nesta pasta e acesse http://localhost:8000. A aplicação também pode ser servida pelo GitHub Pages a partir da raiz do repositório.

## Fluxo

1. No seletor de perfil, escolha Usuário mestre e cadastre proprietário, WhatsApp, veículo, foto e vídeo.
2. Abra Pendentes de avaliação, selecione o veículo e registre o valor em reais.
3. Confira o veículo no Feed de avaliações. Alterne para Visualizador para simular a consulta sem edição e sem os dados de contato.

Os exemplos são fictícios. A tela abre no perfil Visualizador. O WhatsApp do proprietário aparece apenas no perfil Usuário mestre. Os perfis são selecionáveis sem login e os dados, inclusive as mídias, ficam no IndexedDB do navegador. Use dados de teste. Para uso em equipe, a aplicação precisa de autenticação, permissões no servidor e armazenamento compartilhado.


# 🌍 GeoExplorer  
## Consumo Assíncrono, Processamento Paralelo e Agrupamento de Cidades com K-means

### Trabalho Prático — Programação Assíncrona, Concorrente e Funcional

---

## 📌 Visão Geral

O **GeoExplorer** é uma aplicação web desenvolvida com o objetivo de integrar, de forma coerente e tecnicamente fundamentada, os conceitos de:

- Programação **assíncrona**
- **Concorrência** e **paralelismo**
- **Programação funcional**
- Processamento de dados em larga escala
- Algoritmo de agrupamento **K-means**

O sistema consome dados reais da **GeoDB Cities API**, permitindo a exploração, seleção e posterior análise de milhares de cidades por meio de um algoritmo de clustering paralelizado com **Web Workers** e **SharedArrayBuffer**.

---

## 🎯 Objetivos do Projeto

- Consumir dados paginados da **GeoDB Cities API** de forma assíncrona  
- Manter a interface **totalmente responsiva**, sem bloqueios ou recarregamentos  
- Permitir a seleção incremental de cidades pelo usuário  
- Carregar um grande volume de dados (~10.000 cidades) de forma **paralela**  
- Aplicar o algoritmo **K-means** de forma **explícita**, **paralelizada** e **funcional**  
- Apresentar os clusters finais de maneira clara e explorável  

---

## 🧠 Arquitetura Geral

A aplicação segue uma separação clara entre:

- **Interface Gráfica (UI)**  
- **Gerenciamento de Estado Funcional**  
- **Camada de Efeitos Colaterais (API / Workers)**  
- **Processamento Paralelo com Memória Compartilhada**  

---

## 🔁 Etapa 1 — Consumo Assíncrono da API

- Endpoint: `GET /v1/geo/cities`
- Paginação via `offset` e `limit`
- Requisições assíncronas sem bloqueio da interface
- Navegação entre páginas sem recarregamento

A interface é dividida em:
1. Lista de cidades vindas da API
2. Repositório local de cidades selecionadas

---

## ⚙️ Etapa 2 — Processamento Paralelo

- Carregamento de ~10.000 cidades
- Uso explícito de **Web Workers**
- Divisão de dados por subconjuntos independentes
- Controle de concorrência com **SharedArrayBuffer**

---

## 🧠 Etapa 3 — K-means Paralelizado

- Implementação própria do algoritmo
- Métricas: latitude, longitude e população
- Paralelização do cálculo de distâncias
- Atualização sincronizada dos centroides
- Critério de convergência por deslocamento máximo

---

## 📈 Visualização

- Resumo dos clusters
- Quantidade de cidades por grupo
- Visualização detalhada por cluster

---

## 🛠️ Tecnologias

- HTML5 / CSS3
- JavaScript (ES6+)
- Web Workers
- SharedArrayBuffer
- Node.js
- GeoDB Cities API

---

## ▶️ Execução

```bash
node server.js
```

Acesse:
```
http://localhost:8000
```

---

## 🔐 Observação de Segurança

O servidor define os headers:

- Cross-Origin-Opener-Policy
- Cross-Origin-Embedder-Policy

Esses headers são obrigatórios para habilitar `SharedArrayBuffer`.

---

## ✅ Conclusão

O projeto demonstra a aplicação prática de programação assíncrona, paralela e funcional, integrando conceitos de sistemas concorrentes e aprendizado de máquina de forma explícita e fundamentada.
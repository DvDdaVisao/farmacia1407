// URL base para comunicação com o backend
const API_URL = 'api.php';

// Estado global simples do Front-end
let listProducts = [];
let listSuppliers = [];

document.addEventListener('DOMContentLoaded', () => {
    // Carregar informações iniciais
    loadStockData();
    loadSupplierSelects();
    
    // Injetar data de hoje no painel superior
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('date-display').innerText = new Date().toLocaleDateString('pt-BR', options);

    // Filtro de Busca em Tempo Real
    document.getElementById('search-input').addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filtered = listProducts.filter(item => 
            item.nome.toLowerCase().includes(searchTerm) || 
            item.tag.toLowerCase().includes(searchTerm)
        );
        renderTable(filtered);
    });

    // Submissão de Novo Fornecedor
    document.getElementById('form-fornecedor').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nome = document.getElementById('forn-nome').value;

        const response = await sendPostRequest({ action: 'add_supplier', nome });
        if (response.status === 'success') {
            alert(response.message);
            closeModal('modal-fornecedor');
            document.getElementById('form-fornecedor').reset();
            loadSupplierSelects(); // Atualiza listas dropdown
        } else {
            alert(response.message);
        }
    });

    // Submissão de Novo Produto
    document.getElementById('form-produto').addEventListener('submit', async (e) => {
        e.preventDefault();
        const tag = document.getElementById('prod-tag').value;
        const nome = document.getElementById('prod-nome').value;
        const fornecedor_id = document.getElementById('prod-fornecedor').value;
        const quantidade = document.getElementById('prod-qtd').value;
        const validade = document.getElementById('prod-validade').value;

        const data = { action: 'add_product', tag, nome, fornecedor_id, quantidade, validade };
        
        const response = await sendPostRequest(data);
        if (response.status === 'success') {
            alert(response.message);
            closeModal('modal-produto');
            document.getElementById('form-produto').reset();
            loadStockData(); // Recarrega tabela de estoque
        } else {
            alert(response.message);
        }
    });

    // Submissão de Movimentação de Estoque
    document.getElementById('form-movimentacao').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('mov-prod-id').value;
        const tipo = document.getElementById('mov-tipo').value;
        const quantidade = document.getElementById('mov-qtd').value;

        const data = { action: 'move_stock', id, tipo, quantidade };

        const response = await sendPostRequest(data);
        if (response.status === 'success') {
            alert(response.message);
            closeModal('modal-movimentacao');
            document.getElementById('form-movimentacao').reset();
            loadStockData(); // Recarrega tabela atualizada
        } else {
            alert(response.message);
        }
    });
});

// Busca os produtos do banco via API
async function loadStockData() {
    try {
        const response = await fetch(`${API_URL}?action=get_products`);
        listProducts = await response.json();
        renderTable(listProducts);
    } catch (error) {
        console.error("Erro ao carregar os dados:", error);
        document.getElementById('stock-tbody').innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center; color: var(--primary-red); font-weight:bold; padding: 2rem;">
                    Erro ao conectar-se ao servidor de banco de dados.
                </td>
            </tr>
        `;
    }
}

// Carrega os fornecedores cadastrados para os formulários de seleção
async function loadSupplierSelects() {
    try {
        const response = await fetch(`${API_URL}?action=get_suppliers`);
        listSuppliers = await response.json();
        const select = document.getElementById('prod-fornecedor');
        
        // Limpa opções antigas mantendo a inicial
        select.innerHTML = '<option value="">Selecione um fornecedor...</option>';
        
        listSuppliers.forEach(forn => {
            const opt = document.createElement('option');
            opt.value = forn.id;
            opt.textContent = forn.nome;
            select.appendChild(opt);
        });
    } catch (error) {
        console.error("Erro ao carregar fornecedores:", error);
    }
}

// Renderiza a lista na Tabela do HTML aplicando lógica de alertas e criticidade
function renderTable(data) {
    const tbody = document.getElementById('stock-tbody');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="table-loading">Nenhum produto em estoque encontrado.</td></tr>';
        return;
    }

    const hoje = new Date();

    data.forEach(prod => {
        const tr = document.createElement('tr');
        
        // Validação de Data de Vencimento
        const dataValidade = new Date(prod.validade + 'T00:00:00'); // Trata fuso local
        const diffTempo = dataValidade - hoje;
        const diffDias = Math.ceil(diffTempo / (1000 * 60 * 60 * 24));
        
        let statusBadge = '';
        let rowClass = '';

        // Condições visuais baseadas no controle rigoroso da farmácia
        if (diffDias < 0) {
            statusBadge = `<span class="status-badge status-danger">Vencido</span>`;
        } else if (diffDias <= 90) { // Menos de 3 meses para vencer
            statusBadge = `<span class="status-badge status-warning">Vence em breve</span>`;
        } else if (parseInt(prod.quantidade) === 0) {
            statusBadge = `<span class="status-badge status-danger">Sem estoque</span>`;
        } else if (parseInt(prod.quantidade) <= 15) {
            statusBadge = `<span class="status-badge status-warning">Baixo estoque</span>`;
        } else {
            statusBadge = `<span class="status-badge status-ok">Estoque Normal</span>`;
        }

        // Formatação da data para o padrão do Brasil (DD/MM/AAAA)
        const validadeFormatada = dataValidade.toLocaleDateString('pt-BR');

        tr.innerHTML = `
            <td><span class="tag-badge">${prod.tag}</span></td>
            <td><strong>${prod.nome}</strong></td>
            <td>${prod.fornecedor_nome ? prod.fornecedor_nome : '<span style="color:var(--text-muted)">Sem Fornecedor</span>'}</td>
            <td><strong>${prod.quantidade} unid.</strong></td>
            <td>${validadeFormatada} ${statusBadge}</td>
            <td>
                <div class="row-actions">
                    <!-- Botão de movimentação rápida rápida Entrada (+) / Saída (-) -->
                    <button class="btn-icon move" onclick="openMoveModal(${prod.id}, '${prod.nome}')" title="Registrar Entrada/Saída">
                        <i class="fa-solid fa-right-left"></i>
                    </button>
                    <!-- Deletar item -->
                    <button class="btn-icon delete" onclick="deleteProduct(${prod.id})" title="Excluir Produto">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Abre o modal de entrada e saída rápida para o produto selecionado
function openMoveModal(id, nome) {
    document.getElementById('mov-prod-id').value = id;
    document.getElementById('mov-prod-nome').value = nome;
    openModal('modal-movimentacao');
}

// Exclui um produto do sistema
async function deleteProduct(id) {
    if (confirm("Deseja realmente remover este produto do inventário?")) {
        const response = await sendPostRequest({ action: 'delete_product', id });
        if (response.status === 'success') {
            alert(response.message);
            loadStockData();
        } else {
            alert(response.message);
        }
    }
}

// Auxiliar para efetuar requisições POST com cabeçalho correto
async function sendPostRequest(data) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return await response.json();
    } catch (error) {
        console.error("Erro na requisição:", error);
        return { status: 'error', message: 'Erro na comunicação com o backend.' };
    }
}

// Controle de Visibilidade dos Modais
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}
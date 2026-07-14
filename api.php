<?php
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST");
header("Access-Control-Allow-Headers: Content-Type");

// Configurações do Banco de Dados
$host = "localhost";
$db_name = "pharmastock";
$username = "root"; 
$password = "root"; 

try {
    $conn = new PDO("mysql:host=" . $host . ";dbname=" . $db_name . ";charset=utf8mb4", $username, $password);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch(PDOException $exception) {
    echo json_encode(["status" => "error", "message" => "Erro de conexão: " . $exception->getMessage()]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

// ------------------------- MÉTODOS GET -------------------------
if ($method === 'GET') {
    $action = $_GET['action'] ?? '';

    // Retorna todos os produtos com junção do nome do fornecedor
    if ($action === 'get_products') {
        try {
            $query = "SELECT p.*, f.nome AS fornecedor_nome 
                      FROM produtos p 
                      LEFT JOIN fornecedores f ON p.fornecedor_id = f.id 
                      ORDER BY p.id DESC";
            $stmt = $conn->prepare($query);
            $stmt->execute();
            $products = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode($products);
        } catch (PDOException $e) {
            echo json_encode(["status" => "error", "message" => $e->getMessage()]);
        }
    } 
    // Retorna todos os fornecedores para carregar os campos <select>
    elseif ($action === 'get_suppliers') {
        try {
            $query = "SELECT * FROM fornecedores ORDER BY nome ASC";
            $stmt = $conn->prepare($query);
            $stmt->execute();
            $suppliers = $stmt->fetchAll(PDO::FETCH_ASSOC);
            echo json_encode($suppliers);
        } catch (PDOException $e) {
            echo json_encode(["status" => "error", "message" => $e->getMessage()]);
        }
    }
} 

// ------------------------- MÉTODOS POST -------------------------
elseif ($method === 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    $action = $data['action'] ?? $_POST['action'] ?? '';

    // Ação: Adicionar Fornecedor
    if ($action === 'add_supplier') {
        $nome = trim($data['nome'] ?? $_POST['nome'] ?? '');
        
        if (empty($nome)) {
            echo json_encode(["status" => "error", "message" => "O nome do fornecedor é obrigatório."]);
            exit;
        }

        try {
            $query = "INSERT INTO fornecedores (nome) VALUES (:nome)";
            $stmt = $conn->prepare($query);
            $stmt->bindParam(':nome', $nome);
            $stmt->execute();
            echo json_encode(["status" => "success", "message" => "Fornecedor cadastrado com sucesso!"]);
        } catch(PDOException $e) {
            echo json_encode(["status" => "error", "message" => "Erro ao cadastrar ou fornecedor já existente."]);
        }
    } 

    // Ação: Adicionar Produto
    elseif ($action === 'add_product') {
        $tag = trim($data['tag'] ?? $_POST['tag'] ?? '');
        $nome = trim($data['nome'] ?? $_POST['nome'] ?? '');
        $fornecedor_id = $data['fornecedor_id'] ?? $_POST['fornecedor_id'] ?? null;
        $quantidade = intval($data['quantidade'] ?? $_POST['quantidade'] ?? 0);
        $validade = $data['validade'] ?? $_POST['validade'] ?? '';

        if (empty($tag) || empty($nome) || empty($validade)) {
            echo json_encode(["status" => "error", "message" => "Os campos Tag, Nome e Validade são obrigatórios."]);
            exit;
        }

        try {
            $query = "INSERT INTO produtos (tag, nome, fornecedor_id, quantidade, validade) 
                      VALUES (:tag, :nome, :fornecedor_id, :quantidade, :validade)";
            $stmt = $conn->prepare($query);
            $stmt->bindParam(':tag', $tag);
            $stmt->bindParam(':nome', $nome);
            $stmt->bindValue(':fornecedor_id', $fornecedor_id ? intval($fornecedor_id) : null, PDO::PARAM_INT);
            $stmt->bindParam(':quantidade', $quantidade, PDO::PARAM_INT);
            $stmt->bindParam(':validade', $validade);
            $stmt->execute();
            echo json_encode(["status" => "success", "message" => "Produto cadastrado com sucesso!"]);
        } catch(PDOException $e) {
            echo json_encode(["status" => "error", "message" => "Erro ao cadastrar produto (TAG já existe?)."]);
        }
    } 

    // Ação: Movimentação de Entrada e Saída (Atualiza quantidades)
    elseif ($action === 'move_stock') {
        $id = intval($data['id'] ?? $_POST['id'] ?? 0);
        $tipo = $data['tipo'] ?? $_POST['tipo'] ?? ''; // 'entrada' ou 'saida'
        $qtd = intval($data['quantidade'] ?? $_POST['quantidade'] ?? 0);

        if ($id <= 0 || empty($tipo) || $qtd <= 0) {
            echo json_encode(["status" => "error", "message" => "Dados para movimentação inválidos."]);
            exit;
        }

        try {
            // Se for saída, verifica se a quantidade disponível é suficiente
            if ($tipo === 'saida') {
                $checkQuery = "SELECT quantidade FROM produtos WHERE id = :id";
                $checkStmt = $conn->prepare($checkQuery);
                $checkStmt->bindParam(':id', $id, PDO::PARAM_INT);
                $checkStmt->execute();
                $currentQtd = intval($checkStmt->fetchColumn());

                if ($currentQtd < $qtd) {
                    echo json_encode(["status" => "error", "message" => "Erro: Quantidade insuficiente em estoque para esta saída."]);
                    exit;
                }
                $updateVal = -$qtd;
            } else {
                $updateVal = $qtd;
            }

            $query = "UPDATE produtos SET quantidade = quantidade + :val WHERE id = :id";
            $stmt = $conn->prepare($query);
            $stmt->bindParam(':val', $updateVal, PDO::PARAM_INT);
            $stmt->bindParam(':id', $id, PDO::PARAM_INT);
            $stmt->execute();

            echo json_encode(["status" => "success", "message" => "Estoque atualizado com sucesso!"]);
        } catch(PDOException $e) {
            echo json_encode(["status" => "error", "message" => "Erro ao processar movimentação: " . $e->getMessage()]);
        }
    }

    // Ação: Excluir Produto do Estoque
    elseif ($action === 'delete_product') {
        $id = intval($data['id'] ?? $_POST['id'] ?? 0);
        if ($id <= 0) {
            echo json_encode(["status" => "error", "message" => "ID do produto inválido."]);
            exit;
        }

        try {
            $query = "DELETE FROM produtos WHERE id = :id";
            $stmt = $conn->prepare($query);
            $stmt->bindParam(':id', $id, PDO::PARAM_INT);
            $stmt->execute();
            echo json_encode(["status" => "success", "message" => "Produto deletado com sucesso."]);
        } catch(PDOException $e) {
            echo json_encode(["status" => "error", "message" => "Erro ao deletar produto."]);
        }
    }
}
?>
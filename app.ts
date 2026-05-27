// app.ts - Versão final com controle de créditos, leads restantes e admin configurável
// Superusuário: email@LeadScraperPro.com / Jcnvap123#


// ==================== INTERFACES ====================

interface Lead {
  nome: string;
  telefone: string;
  endereco: string;
  website: string;
  categoria: string;
  avaliacao: number;
  quantidadeReviews: number;
  latitude: number;
  longitude: number;
}

interface Usuario {
  email: string;
  senha: string;
  creditos: number;
  createdAt: string;
  isSuperAdmin?: boolean;
  apiKeys?: {
    googleApiKey?: string;
    serpApiKey?: string;
  };
  costPerApi?: {
    googlePlacesMock?: number;  // custo por lead para simulação (padrão 0)
    serpApi?: number;           // custo por lead (ex: 1)
    apify?: number;             // custo por lead (ex: 2)
  };
  limits?: {
    maxLeadsPerSearch?: number; // limite personalizado (padrão 120)
  };
}

interface ConfiguracaoGlobal {
  delayEntreRequisicoes: number;
  timeout: number;
  githubToken: string;
  githubRepo: string;
  firebaseConfig: string;
}

// ==================== CONSTANTES ====================

const STORAGE_USERS = "leadscraper_users";
const STORAGE_SESSION = "leadscraper_session";
const STORAGE_GLOBAL_CONFIG = "leadscraper_global_config";
const DEFAULT_MAX_LEADS = 120;

const SUPER_ADMIN_EMAIL = "admin@leadscraper.com";
const SUPER_ADMIN_SENHA = "Jcnvap123#";

// ==================== MOCK DATA ====================

const NICHOS_EMPRESAS: Record<string, string[]> = {
  pizzaria: ["Pizzaria Napoli", "Pizza Hut Express", "Domino's Pizza", "Pizzaria Bella Italia", "Forno a Lenha"],
  consultoria: ["McKinsey & Company", "BCG Brasil", "Deloitte Consulting", "EY Advisory", "KPMG"],
  advocacia: ["Silva & Advogados", "Justiça Legal", "Souza Advocacia", "Direito & Cidadania", "Almeida Law"],
  academia: ["Smart Fit", "Bio Ritmo", "BodyTech", "Blue Fit", "Selfit Academia"],
  medico: ["Clínica Saúde Total", "Hospital Albert Einstein", "Medicina Diagnóstica", "Doctor Consulta", "Centro Médico"],
};

const CATEGORIAS = ["Alimentação", "Consultoria", "Jurídico", "Saúde", "Educação", "Tecnologia", "Varejo"];
const WEBSITES = [".com.br", ".com", ".org", ".net"];
const RUAS = ["Av. Paulista", "Rua Augusta", "Av. Brasil", "Rua Oscar Freire", "Av. das Nações Unidas"];

function gerarTelefone(): string {
  return `(${Math.floor(Math.random() * 99) + 10}) ${Math.floor(Math.random() * 90000) + 10000}-${Math.floor(Math.random() * 9000) + 1000}`;
}

function gerarLead(nicho: string, cidade: string, estado: string, index: number): Lead {
  const nomesNicho = NICHOS_EMPRESAS[nicho.toLowerCase()] || [`${nicho} ${cidade}`];
  const nomeBase = nomesNicho[index % nomesNicho.length];
  const nome = `${nomeBase} ${Math.floor(index / nomesNicho.length) + 1}`;
  const categoria = CATEGORIAS[index % CATEGORIAS.length];
  const websiteSufixo = WEBSITES[index % WEBSITES.length];
  const rua = RUAS[index % RUAS.length];
  
  return {
    nome,
    telefone: gerarTelefone(),
    endereco: `${rua}, ${Math.floor(Math.random() * 2000) + 1} - ${cidade}, ${estado}`,
    website: `www.${nome.toLowerCase().replace(/\s/g, '')}${websiteSufixo}`,
    categoria,
    avaliacao: +(Math.random() * 5).toFixed(1),
    quantidadeReviews: Math.floor(Math.random() * 500) + 1,
    latitude: -23.5505 + (Math.random() - 0.5) * 0.1,
    longitude: -46.6333 + (Math.random() - 0.5) * 0.1,
  };
}

function gerarLeadsMock(params: {
  nicho: string;
  cidade: string;
  estado: string;
  quantidade: number;
  avaliacaoMinima: number;
}): Lead[] {
  const maxPermitido = DEFAULT_MAX_LEADS;
  const count = Math.min(params.quantidade, maxPermitido);
  const leads: Lead[] = [];
  for (let i = 0; i < count; i++) {
    let lead = gerarLead(params.nicho, params.cidade, params.estado, i);
    if (lead.avaliacao < params.avaliacaoMinima) {
      lead.avaliacao = params.avaliacaoMinima;
    }
    leads.push(lead);
  }
  return leads;
}

// ==================== GERENCIAMENTO DE USUÁRIOS ====================

function obterUsuarios(): Usuario[] {
  const stored = localStorage.getItem(STORAGE_USERS);
  let users = stored ? JSON.parse(stored) : [];
  const superExists = users.some((u: Usuario) => u.email === SUPER_ADMIN_EMAIL);
  if (!superExists) {
    users.push({
      email: "email@buscaleads.com",
      senha: "Jcnvap6598$",
      creditos: 999999,
      createdAt: new Date().toISOString(),
      isSuperAdmin: true,
      apiKeys: { googleApiKey: "", serpApiKey: "" },
      costPerApi: { googlePlacesMock: 0, serpApi: 1, apify: 2 },
      limits: { maxLeadsPerSearch: DEFAULT_MAX_LEADS }
    });
    salvarUsuarios(users);
  }
  return users;
}

function salvarUsuarios(usuarios: Usuario[]): void {
  localStorage.setItem(STORAGE_USERS, JSON.stringify(usuarios));
}

function usuarioLogado(): Usuario | null {
  const email = localStorage.getItem(STORAGE_SESSION);
  if (!email) return null;
  return obterUsuarios().find(u => u.email === email) || null;
}

function salvarSessao(email: string): void {
  localStorage.setItem(STORAGE_SESSION, email);
}

function encerrarSessao(): void {
  localStorage.removeItem(STORAGE_SESSION);
}

function cadastrar(email: string, senha: string): { sucesso: boolean; mensagem: string } {
  if (!email || !senha) return { sucesso: false, mensagem: "Preencha todos os campos." };
  if (!email.includes("@")) return { sucesso: false, mensagem: "E-mail inválido." };
  const usuarios = obterUsuarios();
  if (usuarios.find(u => u.email === email)) {
    return { sucesso: false, mensagem: "E-mail já cadastrado." };
  }
  const novoUsuario: Usuario = {
    email,
    senha,
    creditos: 999999,
    createdAt: new Date().toISOString(),
    apiKeys: { googleApiKey: "", serpApiKey: "" },
    costPerApi: { googlePlacesMock: 0, serpApi: 1, apify: 2 },
    limits: { maxLeadsPerSearch: DEFAULT_MAX_LEADS }
  };
  usuarios.push(novoUsuario);
  salvarUsuarios(usuarios);
  salvarSessao(email);
  return { sucesso: true, mensagem: "Cadastro realizado! Modo demo livre." };
}

function login(email: string, senha: string): { sucesso: boolean; mensagem: string } {
  const usuarios = obterUsuarios();
  const usuario = usuarios.find(u => u.email === email && u.senha === senha);
  if (!usuario) {
    return { sucesso: false, mensagem: "E-mail ou senha incorretos." };
  }
  salvarSessao(email);
  return { sucesso: true, mensagem: "Login bem-sucedido." };
}

// Consumir créditos com base no custo por lead da API e quantidade
function consumirCreditos(usuario: Usuario, apiTipo: string, quantidadeLeads: number): boolean {
  if (!usuario) return false;
  const custoPorLead = usuario.costPerApi?.[apiTipo as keyof typeof usuario.costPerApi] ?? 1;
  const custoTotal = custoPorLead * quantidadeLeads;
  if (usuario.creditos >= custoTotal) {
    usuario.creditos -= custoTotal;
    // Atualizar na lista de usuários
    const usuarios = obterUsuarios();
    const idx = usuarios.findIndex(u => u.email === usuario.email);
    if (idx !== -1) {
      usuarios[idx].creditos = usuario.creditos;
      salvarUsuarios(usuarios);
    }
    return true;
  }
  return false;
}

function adicionarCreditos(email: string, quantidade: number): void {
  const usuarios = obterUsuarios();
  const idx = usuarios.findIndex(u => u.email === email);
  if (idx !== -1) {
    usuarios[idx].creditos += quantidade;
    salvarUsuarios(usuarios);
  }
}

function atualizarChavesAPI(email: string, googleKey: string, serpKey: string): void {
  const usuarios = obterUsuarios();
  const idx = usuarios.findIndex(u => u.email === email);
  if (idx !== -1) {
    usuarios[idx].apiKeys = { googleApiKey: googleKey, serpApiKey: serpKey };
    salvarUsuarios(usuarios);
  }
}

function atualizarCustoPorAPI(email: string, custos: { googlePlacesMock?: number; serpApi?: number; apify?: number }): void {
  const usuarios = obterUsuarios();
  const idx = usuarios.findIndex(u => u.email === email);
  if (idx !== -1) {
    usuarios[idx].costPerApi = { ...usuarios[idx].costPerApi, ...custos };
    salvarUsuarios(usuarios);
  }
}

function atualizarLimiteUsuario(email: string, maxLeads: number): void {
  const usuarios = obterUsuarios();
  const idx = usuarios.findIndex(u => u.email === email);
  if (idx !== -1) {
    usuarios[idx].limits = { maxLeadsPerSearch: maxLeads };
    salvarUsuarios(usuarios);
  }
}

// ==================== CONFIGURAÇÕES GLOBAIS ====================

let configGlobal: ConfiguracaoGlobal = {
  delayEntreRequisicoes: 500,
  timeout: 30000,
  githubToken: "",
  githubRepo: "",
  firebaseConfig: "",
};

function carregarConfigGlobal(): void {
  const stored = localStorage.getItem(STORAGE_GLOBAL_CONFIG);
  if (stored) {
    try {
      configGlobal = { ...configGlobal, ...JSON.parse(stored) };
    } catch (e) {}
  }
}

function salvarConfigGlobal(): void {
  localStorage.setItem(STORAGE_GLOBAL_CONFIG, JSON.stringify(configGlobal));
}

// ==================== ESTADO GLOBAL DA UI ====================

let leadsAtuais: Lead[] = [];
let leadsFiltrados: Lead[] = [];
let paginaAtual = 1;
const itensPorPagina = 10;
let ordenacao: { coluna: keyof Lead; direcao: "asc" | "desc" } = { coluna: "nome", direcao: "asc" };
let termoBuscaTabela = "";

let appContainer: HTMLElement;
let authContainer: HTMLElement;
let userEmailSpan: HTMLElement;
let creditosSpan: HTMLElement;
let remainingLeadsSpan: HTMLElement;
let tabelaBody: HTMLElement;
let paginationDiv: HTMLElement;
let buscaTabelaInput: HTMLInputElement;
let resultadosCountSpan: HTMLElement;

// ==================== FUNÇÕES DE UI ====================

function mostrarTelaLogin(): void {
  if (authContainer) authContainer.style.display = "flex";
  if (appContainer) appContainer.style.display = "none";
  document.getElementById("loginForm")?.classList.remove("hidden");
  document.getElementById("registerForm")?.classList.add("hidden");
  (document.getElementById("loginError") as HTMLElement).textContent = "";
  (document.getElementById("registerError") as HTMLElement).textContent = "";
}

function atualizarLeadsRestantes(): void {
  const user = usuarioLogado();
  if (!user) {
    remainingLeadsSpan.textContent = "---";
    return;
  }
  const tipoBusca = (document.getElementById("tipoBusca") as HTMLSelectElement).value;
  let custoPorLead = user.costPerApi?.[tipoBusca as keyof typeof user.costPerApi];
  if (custoPorLead === undefined) custoPorLead = 1;
  
  if (custoPorLead === 0) {
    remainingLeadsSpan.textContent = "∞ (simulação)";
    return;
  }
  const leadsRestantes = Math.floor(user.creditos / custoPorLead);
  remainingLeadsSpan.textContent = String(leadsRestantes);
}

function atualizarSaldoUI(): void {
  const user = usuarioLogado();
  if (user) {
    creditosSpan.textContent = user.creditos >= 999999 ? "∞ (demo)" : String(user.creditos);
    atualizarLeadsRestantes();
  }
}

function mostrarApp(): void {
  if (authContainer) authContainer.style.display = "none";
  if (appContainer) appContainer.style.display = "block";
  const user = usuarioLogado();
  if (user) {
    userEmailSpan.textContent = user.email;
    creditosSpan.textContent = user.creditos >= 999999 ? "∞ (demo)" : String(user.creditos);
    
    (document.getElementById("apiKey") as HTMLInputElement).value = user.apiKeys?.googleApiKey || "";
    (document.getElementById("serpApiKey") as HTMLInputElement).value = user.apiKeys?.serpApiKey || "";
    
    const adminSection = document.getElementById("adminSection");
    if (user.isSuperAdmin) {
      adminSection!.style.display = "block";
    } else {
      adminSection!.style.display = "none";
    }
    atualizarLeadsRestantes();
  }
  carregarConfigGlobal();
    leadsAtuais = gerarLeadsMock({
    nicho: "pizzaria",
    cidade: "São Paulo",
    estado: "SP",
    quantidade: 10,
    avaliacaoMinima: 0,
  });
  aplicarFiltrosEOrdenacao();
}

function salvarChavesDoUsuario(): void {
  const user = usuarioLogado();
  if (!user) return;
  const googleKey = (document.getElementById("apiKey") as HTMLInputElement).value;
  const serpKey = (document.getElementById("serpApiKey") as HTMLInputElement).value;
  atualizarChavesAPI(user.email, googleKey, serpKey);
  alert("Chaves de API salvas para este usuário.");
}

// ==================== RENDERIZAÇÃO DA TABELA ====================

function aplicarFiltrosEOrdenacao(): void {
  let filtrados = leadsAtuais.filter(lead =>
    lead.nome.toLowerCase().includes(termoBuscaTabela.toLowerCase()) ||
    lead.telefone.includes(termoBuscaTabela) ||
    lead.endereco.toLowerCase().includes(termoBuscaTabela.toLowerCase()) ||
    lead.categoria.toLowerCase().includes(termoBuscaTabela.toLowerCase())
  );

  filtrados.sort((a, b) => {
    let valorA = a[ordenacao.coluna];
    let valorB = b[ordenacao.coluna];
    if (typeof valorA === "string" && typeof valorB === "string") {
      return ordenacao.direcao === "asc" ? valorA.localeCompare(valorB) : valorB.localeCompare(valorA);
    } else if (typeof valorA === "number" && typeof valorB === "number") {
      return ordenacao.direcao === "asc" ? valorA - valorB : valorB - valorA;
    }
    return 0;
  });

  leadsFiltrados = filtrados;
  paginaAtual = 1;
  renderizarTabela();
  renderizarPaginacao();
}

function renderizarTabela(): void {
  if (!tabelaBody) return;
  const inicio = (paginaAtual - 1) * itensPorPagina;
  const fim = inicio + itensPorPagina;
  const leadsPagina = leadsFiltrados.slice(inicio, fim);

  resultadosCountSpan.textContent = `${leadsFiltrados.length} leads encontrados`;

  tabelaBody.innerHTML = leadsPagina
    .map(
      (lead) => `
    <tr class="border-t border-gray-700 hover:bg-gray-800 transition-colors">
      <td class="px-4 py-3 font-medium">${escapeHtml(lead.nome)}</td>
      <td class="px-4 py-3">${escapeHtml(lead.telefone)}</td>
      <td class="px-4 py-3">${escapeHtml(lead.endereco)}</td>
      <td class="px-4 py-3"><a href="https://${escapeHtml(lead.website)}" target="_blank" class="text-blue-400 hover:underline">${escapeHtml(lead.website)}</a></td>
      <td class="px-4 py-3">${escapeHtml(lead.categoria)}</td>
      <td class="px-4 py-3">${lead.avaliacao} ★</td>
      <td class="px-4 py-3">${lead.quantidadeReviews}</td>
      <td class="px-4 py-3">${lead.latitude.toFixed(4)}</td>
      <td class="px-4 py-3">${lead.longitude.toFixed(4)}</td>
     </tr>
  `
    )
    .join("");
}

function renderizarPaginacao(): void {
  if (!paginationDiv) return;
  const totalPaginas = Math.ceil(leadsFiltrados.length / itensPorPagina);
  if (totalPaginas <= 1) {
    paginationDiv.innerHTML = "";
    return;
  }

  let paginasHtml = "";
  for (let i = 1; i <= Math.min(totalPaginas, 10); i++) {
    paginasHtml += `
      <button class="pagina-btn px-3 py-1 rounded-lg transition ${i === paginaAtual ? "bg-purple-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}" data-pagina="${i}">
        ${i}
      </button>
    `;
  }

  paginationDiv.innerHTML = `
    <button class="prev-btn px-3 py-1 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 transition" ${paginaAtual === 1 ? "disabled" : ""}>Anterior</button>
    ${paginasHtml}
    <button class="next-btn px-3 py-1 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 transition" ${paginaAtual === totalPaginas ? "disabled" : ""}>Próximo</button>
  `;

  document.querySelectorAll(".pagina-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      paginaAtual = parseInt((e.target as HTMLElement).dataset.pagina || "1", 10);
      renderizarTabela();
      renderizarPaginacao();
    });
  });

  const prevBtn = document.querySelector(".prev-btn");
  const nextBtn = document.querySelector(".next-btn");
  prevBtn?.addEventListener("click", () => {
    if (paginaAtual > 1) {
      paginaAtual--;
      renderizarTabela();
      renderizarPaginacao();
    }
  });
  nextBtn?.addEventListener("click", () => {
    if (paginaAtual < totalPaginas) {
      paginaAtual++;
      renderizarTabela();
      renderizarPaginacao();
    }
  });
}

function ordenarTabela(coluna: keyof Lead): void {
  if (ordenacao.coluna === coluna) {
    ordenacao.direcao = ordenacao.direcao === "asc" ? "desc" : "asc";
  } else {
    ordenacao.coluna = coluna;
    ordenacao.direcao = "asc";
  }
  aplicarFiltrosEOrdenacao();
}

// ==================== EXPORTAÇÕES ====================

function exportarCSV(): void {
  if (leadsFiltrados.length === 0) {
    alert("Nenhum lead para exportar.");
    return;
  }
  const headers = ["Nome", "Telefone", "Endereço", "Website", "Categoria", "Avaliação", "Reviews", "Latitude", "Longitude"];
  const rows = leadsFiltrados.map((lead) => [
    lead.nome,
    lead.telefone,
    lead.endereco,
    lead.website,
    lead.categoria,
    lead.avaliacao,
    lead.quantidadeReviews,
    lead.latitude,
    lead.longitude,
  ]);
  const csvContent = [headers, ...rows].map((row) => row.join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.setAttribute("download", "leads.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportarJSON(): void {
  if (leadsFiltrados.length === 0) {
    alert("Nenhum lead para exportar.");
    return;
  }
  const jsonContent = JSON.stringify(leadsFiltrados, null, 2);
  const blob = new Blob([jsonContent], { type: "application/json" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.setAttribute("download", "leads.json");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportarXLSX(): void {
  if (leadsFiltrados.length === 0) {
    alert("Nenhum lead para exportar.");
    return;
  }
  let tabelaHTML = `
    <html>
    <head><meta charset="UTF-8"><title>Leads</title></head>
    <body>
      <table border="1">
        <thead><tr><th>Nome</th><th>Telefone</th><th>Endereço</th><th>Website</th><th>Categoria</th><th>Avaliação</th><th>Reviews</th><th>Latitude</th><th>Longitude</th></tr></thead>
        <tbody>
  `;
  leadsFiltrados.forEach(lead => {
    tabelaHTML += `<tr><td>${escapeHtml(lead.nome)}</td><td>${escapeHtml(lead.telefone)}</td><td>${escapeHtml(lead.endereco)}</td><td>${escapeHtml(lead.website)}</td><td>${escapeHtml(lead.categoria)}</td><td>${lead.avaliacao}</td><td>${lead.quantidadeReviews}</td><td>${lead.latitude.toFixed(4)}</td><td>${lead.longitude.toFixed(4)}</td></tr>`;
  });
  tabelaHTML += `</tbody></table></body></html>`;
  const blob = new Blob([tabelaHTML], { type: "application/vnd.ms-excel" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.setAttribute("download", "leads.xls");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function copiarDadosTabela(): void {
  if (leadsFiltrados.length === 0) {
    alert("Nenhum dado para copiar.");
    return;
  }
  const texto = leadsFiltrados
    .map(
      (lead) => `${lead.nome}\t${lead.telefone}\t${lead.endereco}\t${lead.website}\t${lead.categoria}\t${lead.avaliacao}\t${lead.quantidadeReviews}`
    )
    .join("\n");
  navigator.clipboard
    .writeText(texto)
    .then(() => alert(`${leadsFiltrados.length} leads copiados.`))
    .catch(() => alert("Erro ao copiar."));
}

// ==================== CARDS DAS PLATAFORMAS ====================

const PLATAFORMAS = [
  { id: "googlePlacesMock", nome: "Google Places API (Mock - Demo Grátis)", facilidade: 5, velocidade: 3, custoBeneficio: 5, limiteGratuito: "Ilimitado (demo)", qualidadeDados: 3, melhorUso: "Testes livres" },
  { id: "serpApi", nome: "SerpApi (Requer ativação)", facilidade: 4, velocidade: 5, custoBeneficio: 4, limiteGratuito: "Créditos por lead", qualidadeDados: 5, melhorUso: "Dados reais" },
  { id: "apify", nome: "Apify (Requer ativação)", facilidade: 4, velocidade: 4, custoBeneficio: 3, limiteGratuito: "Créditos por lead", qualidadeDados: 4, melhorUso: "Larga escala" },
];

function renderizarCardsPlataforma(): void {
  const container = document.getElementById("plataformasContainer");
  if (!container) return;
  container.innerHTML = PLATAFORMAS.map(p => `
    <div class="card-plataforma bg-gray-800/50 rounded-xl p-5 border border-gray-700 hover:border-gray-600 transition-all">
      <h3 class="text-lg font-bold mb-2">${p.nome}</h3>
      <div class="space-y-1 text-sm">
        <div class="flex justify-between"><span>Facilidade:</span><div class="stars">${"★".repeat(p.facilidade)}${"☆".repeat(5 - p.facilidade)}</div></div>
        <div class="flex justify-between"><span>Velocidade:</span><div class="stars">${"★".repeat(p.velocidade)}${"☆".repeat(5 - p.velocidade)}</div></div>
        <div class="flex justify-between"><span>Custo-benefício:</span><div class="stars">${"★".repeat(p.custoBeneficio)}${"☆".repeat(5 - p.custoBeneficio)}</div></div>
        <div class="text-xs text-gray-400 mt-2"><i class="fas fa-gift mr-1"></i> ${p.limiteGratuito}</div>
        <div class="text-xs text-purple-400"><i class="fas fa-lightbulb mr-1"></i> ${p.melhorUso}</div>
      </div>
    </div>
  `).join("");
}

// ==================== PROSPECÇÃO COM CONSUMO DE CRÉDITOS ====================

async function iniciarProspeccao(): Promise<void> {
  const nicho = (document.getElementById("nicho") as HTMLInputElement).value;
  const cidade = (document.getElementById("cidade") as HTMLInputElement).value;
  const estado = (document.getElementById("estado") as HTMLInputElement).value;
  const keyword = (document.getElementById("palavraChave") as HTMLInputElement).value;
  let quantidade = parseInt((document.getElementById("quantidade") as HTMLInputElement).value);
  const tipoBusca = (document.getElementById("tipoBusca") as HTMLSelectElement).value;
  const avaliacaoMin = parseFloat((document.getElementById("minRating") as HTMLInputElement).value) || 0;

  if (isNaN(quantidade) || quantidade < 1) quantidade = 10;
  
  const user = usuarioLogado();
  if (!user) {
    alert("Usuário não logado.");
    return;
  }
  
  const maxPermitido = user.limits?.maxLeadsPerSearch ?? DEFAULT_MAX_LEADS;
  if (quantidade > maxPermitido) {
    alert(`Limite máximo para este usuário é ${maxPermitido} leads por busca.`);
    quantidade = maxPermitido;
    (document.getElementById("quantidade") as HTMLInputElement).value = String(quantidade);
  }

  const custoPorLead = user.costPerApi?.[tipoBusca as keyof typeof user.costPerApi] ?? 1;
  const custoTotal = custoPorLead * quantidade;
  
  if (custoPorLead > 0 && user.creditos < custoTotal) {
    alert(`Créditos insuficientes. Você possui ${user.creditos} créditos. Necessário ${custoTotal}. Solicite upgrade.`);
    abrirModalUpgrade();
    return;
  }
  
  if (custoPorLead > 0) {
    const confirmMsg = `Esta operação consumirá ${custoTotal} créditos (${custoPorLead} por lead). Deseja continuar?`;
    if (!confirm(confirmMsg)) return;
    
    const consumido = consumirCreditos(user, tipoBusca, quantidade);
    if (!consumido) {
      alert("Erro ao consumir créditos. Tente novamente.");
      return;
    }
    atualizarSaldoUI();
    alert(`Créditos consumidos: ${custoTotal}. Saldo restante: ${user.creditos}`);
  } else {
    // Custo zero: simulação livre, sem consumo
    alert(`Modo simulação (${tipoBusca}) - sem consumo de créditos.`);
  }

  const btn = document.getElementById("btnIniciar") as HTMLButtonElement;
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Prospectando...';
  await new Promise(r => setTimeout(r, 1500));

  const leads = gerarLeadsMock({
    nicho: keyword || nicho,
    cidade,
    estado,
    quantidade,
    avaliacaoMinima: avaliacaoMin,
  });

  leadsAtuais = leads;
  termoBuscaTabela = "";
  (document.getElementById("buscaTabela") as HTMLInputElement).value = "";
  aplicarFiltrosEOrdenacao();

  const notif = document.createElement("div");
  notif.className = "fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-fade-in";
  notif.innerHTML = `<i class="fas fa-check-circle"></i> ${leads.length} leads gerados. Saldo: ${usuarioLogado()?.creditos}`;
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 3000);
  btn.disabled = false;
  btn.innerHTML = original;
}

// ==================== UPGRADE ====================

function abrirModalUpgrade(): void {
  document.getElementById("creditsModal")?.classList.remove("hidden");
}
function fecharModalUpgrade(): void {
  document.getElementById("creditsModal")?.classList.add("hidden");
}
function solicitarUpgradeWhatsApp(): void {
  const user = usuarioLogado();
  const email = user ? user.email : "";
  const mensagem = `Olá, gostaria de informações sobre liberação de acesso. Meu e-mail: ${email}`;
  const telefone = "5534997824990";
  const texto = encodeURIComponent(mensagem);
  const url = `https://web.whatsapp.com/send?phone=${telefone}&text=${texto}`;
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (!win || win.closed || typeof win.closed === 'undefined') {
    alert("Clique em OK para copiar o link e cole no navegador:\n\n" + url);
    navigator.clipboard.writeText(url).then(() => alert("Link copiado!"));
  } else {
    win.focus();
  }
  fecharModalUpgrade();
}
function solicitarUpgradeEmail(): void {
  const user = usuarioLogado();
  const email = user ? user.email : "";
  window.location.href = `mailto:websitelogx@gmail.com?subject=Informações%20de%20liberação&body=Meu%20e-mail:%20${email}`;
  fecharModalUpgrade();
}

// ==================== ADMIN ====================

function abrirAdminPanel(): void {
  const modal = document.getElementById("adminModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  carregarListaUsuarios();
  (document.getElementById("adminGithubToken") as HTMLInputElement).value = configGlobal.githubToken;
  (document.getElementById("adminGithubRepo") as HTMLInputElement).value = configGlobal.githubRepo;
  (document.getElementById("adminFirebaseConfig") as HTMLTextAreaElement).value = configGlobal.firebaseConfig;
  (document.getElementById("globalDelay") as HTMLInputElement).value = String(configGlobal.delayEntreRequisicoes);
  (document.getElementById("globalTimeout") as HTMLInputElement).value = String(configGlobal.timeout);
}

function fecharAdminPanel(): void {
  document.getElementById("adminModal")?.classList.add("hidden");
}

function carregarListaUsuarios(): void {
  const users = obterUsuarios();
  const container = document.getElementById("usersList");
  if (!container) return;
  container.innerHTML = users.map(user => `
    <div class="user-item">
      <strong>${escapeHtml(user.email)}</strong> ${user.isSuperAdmin ? '(Super Admin)' : ''}
      <div class="user-chaves">
        <input type="text" id="googleKey_${user.email.replace(/[^a-z0-9]/gi, '_')}" placeholder="Google API Key" value="${user.apiKeys?.googleApiKey || ''}" style="flex:1">
        <input type="text" id="serpKey_${user.email.replace(/[^a-z0-9]/gi, '_')}" placeholder="SerpApi Key" value="${user.apiKeys?.serpApiKey || ''}" style="flex:1">
        <button onclick="adminSalvarChaves('${user.email}')">Salvar Chaves</button>
      </div>
      <div class="user-costs">
        <label>Custo por lead (Mock):</label>
        <input type="number" id="costMock_${user.email.replace(/[^a-z0-9]/gi, '_')}" value="${user.costPerApi?.googlePlacesMock ?? 0}" step="0.1" style="width:80px">
        <label>SerpApi:</label>
        <input type="number" id="costSerp_${user.email.replace(/[^a-z0-9]/gi, '_')}" value="${user.costPerApi?.serpApi ?? 1}" step="0.1" style="width:80px">
        <label>Apify:</label>
        <input type="number" id="costApify_${user.email.replace(/[^a-z0-9]/gi, '_')}" value="${user.costPerApi?.apify ?? 2}" step="0.1" style="width:80px">
        <button onclick="adminSalvarCosts('${user.email}')">Salvar Custos</button>
      </div>
      <div class="user-limits">
        <label>Máx leads por busca:</label>
        <input type="number" id="limit_${user.email.replace(/[^a-z0-9]/gi, '_')}" value="${user.limits?.maxLeadsPerSearch ?? DEFAULT_MAX_LEADS}" style="width:100px">
        <button onclick="adminSalvarLimite('${user.email}')">Atualizar Limite</button>
        <label>Créditos:</label>
        <input type="number" id="creditos_${user.email.replace(/[^a-z0-9]/gi, '_')}" value="${user.creditos}" style="width:100px">
        <button onclick="adminSalvarCreditos('${user.email}')">Atualizar Créditos</button>
      </div>
    </div>
  `).join("");
  
  (window as any).adminSalvarChaves = (email: string) => {
    const safe = email.replace(/[^a-z0-9]/gi, '_');
    const googleKey = (document.getElementById(`googleKey_${safe}`) as HTMLInputElement).value;
    const serpKey = (document.getElementById(`serpKey_${safe}`) as HTMLInputElement).value;
    atualizarChavesAPI(email, googleKey, serpKey);
    alert(`Chaves de API salvas para ${email}`);
  };
  
  (window as any).adminSalvarCosts = (email: string) => {
    const safe = email.replace(/[^a-z0-9]/gi, '_');
    const costMock = parseFloat((document.getElementById(`costMock_${safe}`) as HTMLInputElement).value) || 0;
    const costSerp = parseFloat((document.getElementById(`costSerp_${safe}`) as HTMLInputElement).value) || 0;
    const costApify = parseFloat((document.getElementById(`costApify_${safe}`) as HTMLInputElement).value) || 0;
    atualizarCustoPorAPI(email, { googlePlacesMock: costMock, serpApi: costSerp, apify: costApify });
    if (email === usuarioLogado()?.email) {
      atualizarLeadsRestantes();
    }
    alert(`Custos por API atualizados para ${email}`);
  };
  
  (window as any).adminSalvarLimite = (email: string) => {
    const safe = email.replace(/[^a-z0-9]/gi, '_');
    const maxLeads = parseInt((document.getElementById(`limit_${safe}`) as HTMLInputElement).value);
    if (!isNaN(maxLeads)) {
      atualizarLimiteUsuario(email, maxLeads);
      alert(`Limite de leads atualizado para ${maxLeads}`);
    }
  };
  
  (window as any).adminSalvarCreditos = (email: string) => {
    const safe = email.replace(/[^a-z0-9]/gi, '_');
    const novosCreditos = parseFloat((document.getElementById(`creditos_${safe}`) as HTMLInputElement).value);
    if (!isNaN(novosCreditos)) {
      const usuarios = obterUsuarios();
      const idx = usuarios.findIndex(u => u.email === email);
      if (idx !== -1) {
        usuarios[idx].creditos = novosCreditos;
        salvarUsuarios(usuarios);
        alert(`Créditos de ${email} atualizados para ${novosCreditos}`);
        if (usuarioLogado()?.email === email) atualizarSaldoUI();
      }
    }
  };
}

function salvarIntegraçõesAdmin(): void {
  configGlobal.githubToken = (document.getElementById("adminGithubToken") as HTMLInputElement).value;
  configGlobal.githubRepo = (document.getElementById("adminGithubRepo") as HTMLInputElement).value;
  configGlobal.firebaseConfig = (document.getElementById("adminFirebaseConfig") as HTMLTextAreaElement).value;
  salvarConfigGlobal();
  alert("Configurações de integração (GitHub/Firebase) salvas!");
}

function salvarParametrosGlobais(): void {
  configGlobal.delayEntreRequisicoes = parseInt((document.getElementById("globalDelay") as HTMLInputElement).value) || 500;
  configGlobal.timeout = parseInt((document.getElementById("globalTimeout") as HTMLInputElement).value) || 30000;
  salvarConfigGlobal();
  alert("Parâmetros globais salvos!");
}

// ==================== CONFIGURAÇÕES DO USUÁRIO ====================

function salvarConfiguracoesUsuario(): void {
  salvarChavesDoUsuario();
  const delay = parseInt((document.getElementById("delayRequests") as HTMLInputElement).value);
  const timeout = parseInt((document.getElementById("timeout") as HTMLInputElement).value);
  const minRating = parseFloat((document.getElementById("minRating") as HTMLInputElement).value);
  localStorage.setItem(`user_config_${usuarioLogado()?.email}`, JSON.stringify({ delay, timeout, minRating }));
  alert("Configurações salvas localmente.");
}

function carregarConfiguracoesUsuario(): void {
  const user = usuarioLogado();
  if (!user) return;
  const saved = localStorage.getItem(`user_config_${user.email}`);
  if (saved) {
    try {
      const cfg = JSON.parse(saved);
      (document.getElementById("delayRequests") as HTMLInputElement).value = cfg.delay;
      (document.getElementById("timeout") as HTMLInputElement).value = cfg.timeout;
      (document.getElementById("minRating") as HTMLInputElement).value = cfg.minRating;
    } catch(e) {}
  }
}

// ==================== UTILITÁRIOS ====================

function escapeHtml(str: string): string {
  return str.replace(/[&<>]/g, function(m) {
    if (m === "&") return "&amp;";
    if (m === "<") return "&lt;";
    if (m === ">") return "&gt;";
    return m;
  });
}

function alternarDarkMode(): void {
  const html = document.documentElement;
  if (html.classList.contains("dark")) {
    html.classList.remove("dark");
    localStorage.setItem("theme", "light");
  } else {
    html.classList.add("dark");
    localStorage.setItem("theme", "dark");
  }
}

function carregarTema(): void {
  const saved = localStorage.getItem("theme");
  if (saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

// ==================== EVENTOS E INICIALIZAÇÃO ====================

function initEventListeners(): void {
  document.getElementById("btnIniciar")?.addEventListener("click", iniciarProspeccao);
  document.getElementById("saveConfig")?.addEventListener("click", salvarConfiguracoesUsuario);
  document.getElementById("themeToggle")?.addEventListener("click", alternarDarkMode);
  document.getElementById("logoutBtn")?.addEventListener("click", () => { encerrarSessao(); mostrarTelaLogin(); });
  document.getElementById("solicitarCreditosBtn")?.addEventListener("click", abrirModalUpgrade);
  document.getElementById("closeModal")?.addEventListener("click", fecharModalUpgrade);
  document.getElementById("whatsappUpgrade")?.addEventListener("click", solicitarUpgradeWhatsApp);
  document.getElementById("emailUpgrade")?.addEventListener("click", solicitarUpgradeEmail);
  
  document.getElementById("openAdminPanel")?.addEventListener("click", abrirAdminPanel);
  document.getElementById("closeAdminModal")?.addEventListener("click", fecharAdminPanel);
  document.getElementById("saveIntegrationsBtn")?.addEventListener("click", salvarIntegraçõesAdmin);
  document.getElementById("saveGlobalParamsBtn")?.addEventListener("click", salvarParametrosGlobais);
  
  document.querySelectorAll(".admin-tab").forEach(tab => {
    tab.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).dataset.tab;
      document.querySelectorAll(".admin-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".admin-panel").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      if (target === "users") document.getElementById("adminUsersPanel")?.classList.add("active");
      if (target === "integrations") document.getElementById("adminIntegrationsPanel")?.classList.add("active");
      if (target === "global") document.getElementById("adminGlobalPanel")?.classList.add("active");
    });
  });
  
  document.getElementById("exportCSV")?.addEventListener("click", exportarCSV);
  document.getElementById("exportJSON")?.addEventListener("click", exportarJSON);
  document.getElementById("exportXLSX")?.addEventListener("click", exportarXLSX);
  document.getElementById("copyTable")?.addEventListener("click", copiarDadosTabela);
  document.getElementById("buscaTabela")?.addEventListener("input", (e) => {
    termoBuscaTabela = (e.target as HTMLInputElement).value;
    aplicarFiltrosEOrdenacao();
  });
  document.querySelectorAll(".sortable-header").forEach(header => {
    header.addEventListener("click", () => {
      const coluna = header.getAttribute("data-coluna") as keyof Lead;
      if (coluna) ordenarTabela(coluna);
    });
  });
  
  // Atualizar leads restantes quando mudar o tipo de busca
  document.getElementById("tipoBusca")?.addEventListener("change", () => {
    atualizarLeadsRestantes();
  });
  
  document.getElementById("doLogin")?.addEventListener("click", () => {
    const email = (document.getElementById("loginEmail") as HTMLInputElement).value;
    const senha = (document.getElementById("loginSenha") as HTMLInputElement).value;
    const res = login(email, senha);
    if (res.sucesso) {
      mostrarApp();
      carregarConfiguracoesUsuario();
    } else {
      (document.getElementById("loginError") as HTMLElement).textContent = res.mensagem;
    }
  });
  document.getElementById("doRegister")?.addEventListener("click", () => {
    const email = (document.getElementById("regEmail") as HTMLInputElement).value;
    const senha = (document.getElementById("regSenha") as HTMLInputElement).value;
    const res = cadastrar(email, senha);
    if (res.sucesso) {
      alert(res.mensagem);
      mostrarApp();
      carregarConfiguracoesUsuario();
    } else {
      (document.getElementById("registerError") as HTMLElement).textContent = res.mensagem;
    }
  });
  document.getElementById("showRegister")?.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("loginForm")?.classList.add("hidden");
    document.getElementById("registerForm")?.classList.remove("hidden");
  });
  document.getElementById("showLogin")?.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("registerForm")?.classList.add("hidden");
    document.getElementById("loginForm")?.classList.remove("hidden");
  });
}

function init(): void {
  appContainer = document.getElementById("appContainer") as HTMLElement;
  authContainer = document.getElementById("authContainer") as HTMLElement;
  userEmailSpan = document.getElementById("userEmail") as HTMLElement;
  creditosSpan = document.getElementById("creditosSaldo") as HTMLElement;
  remainingLeadsSpan = document.getElementById("remainingLeads") as HTMLElement;
  tabelaBody = document.getElementById("leadsTableBody") as HTMLElement;
  paginationDiv = document.getElementById("pagination") as HTMLElement;
  buscaTabelaInput = document.getElementById("buscaTabela") as HTMLInputElement;
  resultadosCountSpan = document.getElementById("resultadosCount") as HTMLElement;
  
  carregarTema();
  carregarConfigGlobal();
  if (usuarioLogado()) {
    mostrarApp();
    carregarConfiguracoesUsuario();
  } else {
    mostrarTelaLogin();
  }
  initEventListeners();
}

document.addEventListener("DOMContentLoaded", init);
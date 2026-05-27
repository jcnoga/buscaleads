// app.js - Versão com Firebase Authentication e Firestore

// ==================== VARIÁVEIS GLOBAIS ====================
let currentUser = null;
let currentProfile = null;
let leadsAtuais = [];
let leadsFiltrados = [];
let paginaAtual = 1;
const itensPorPagina = 10;
let ordenacao = { coluna: "nome", direcao: "asc" };
let termoBuscaTabela = "";
let appContainer, authContainer, userEmailSpan, creditosSpan, remainingLeadsSpan;
let tabelaBody, paginationDiv, buscaTabelaInput, resultadosCountSpan;
const DEFAULT_MAX_LEADS = 120;
const SUPER_ADMIN_EMAIL = "admin@leadscraper.com";

// ==================== MOCK DATA (para simulação) ====================
const NICHOS_EMPRESAS = {
  pizzaria: ["Pizzaria Napoli", "Pizza Hut Express", "Domino's Pizza", "Pizzaria Bella Italia", "Forno a Lenha"],
  consultoria: ["McKinsey & Company", "BCG Brasil", "Deloitte Consulting", "EY Advisory", "KPMG"],
  advocacia: ["Silva & Advogados", "Justiça Legal", "Souza Advocacia", "Direito & Cidadania", "Almeida Law"],
  academia: ["Smart Fit", "Bio Ritmo", "BodyTech", "Blue Fit", "Selfit Academia"],
  medico: ["Clínica Saúde Total", "Hospital Albert Einstein", "Medicina Diagnóstica", "Doctor Consulta", "Centro Médico"],
};
const CATEGORIAS = ["Alimentação", "Consultoria", "Jurídico", "Saúde", "Educação", "Tecnologia", "Varejo"];
const WEBSITES = [".com.br", ".com", ".org", ".net"];
const RUAS = ["Av. Paulista", "Rua Augusta", "Av. Brasil", "Rua Oscar Freire", "Av. das Nações Unidas"];

function gerarTelefone() {
  return `(${Math.floor(Math.random() * 99) + 10}) ${Math.floor(Math.random() * 90000) + 10000}-${Math.floor(Math.random() * 9000) + 1000}`;
}

function gerarLead(nicho, cidade, estado, index) {
  const nomesNicho = NICHOS_EMPRESAS[nicho.toLowerCase()] || [`${nicho} ${cidade}`];
  const nomeBase = nomesNicho[index % nomesNicho.length];
  const nome = `${nomeBase} ${Math.floor(index / nomesNicho.length) + 1}`;
  const categoria = CATEGORIAS[index % CATEGORIAS.length];
  const websiteSufixo = WEBSITES[index % WEBSITES.length];
  const rua = RUAS[index % RUAS.length];
  return {
    nome, telefone: gerarTelefone(),
    endereco: `${rua}, ${Math.floor(Math.random() * 2000) + 1} - ${cidade}, ${estado}`,
    website: `www.${nome.toLowerCase().replace(/\s/g, '')}${websiteSufixo}`,
    categoria,
    avaliacao: +(Math.random() * 5).toFixed(1),
    quantidadeReviews: Math.floor(Math.random() * 500) + 1,
    latitude: -23.5505 + (Math.random() - 0.5) * 0.1,
    longitude: -46.6333 + (Math.random() - 0.5) * 0.1,
  };
}

function gerarLeadsMock(params) {
  const count = Math.min(params.quantidade, DEFAULT_MAX_LEADS);
  const leads = [];
  for (let i = 0; i < count; i++) {
    let lead = gerarLead(params.nicho, params.cidade, params.estado, i);
    if (lead.avaliacao < params.avaliacaoMinima) lead.avaliacao = params.avaliacaoMinima;
    leads.push(lead);
  }
  return leads;
}

// ==================== FUNÇÕES DE INICIALIZAÇÃO DO FIREBASE ====================
function initFirebase() {
  const auth = window.firebaseAuth;
  const db = window.firebaseDb;
  const onAuthStateChanged = window.onAuthStateChanged;
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      await carregarPerfilUsuario(user.uid);
      mostrarApp();
    } else {
      currentUser = null;
      currentProfile = null;
      mostrarTelaLogin();
    }
  });
}

async function carregarPerfilUsuario(uid) {
  const { doc, getDoc, setDoc } = window;
  const docRef = doc(window.firebaseDb, "users", uid);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    currentProfile = docSnap.data();
  } else {
    const newProfile = {
      email: currentUser.email,
      creditos: 999999,
      isSuperAdmin: currentUser.email === SUPER_ADMIN_EMAIL,
      apiKeys: { googleApiKey: "", serpApiKey: "" },
      costPerApi: { googlePlacesMock: 0, serpApi: 1, apify: 2 },
      limits: { maxLeadsPerSearch: DEFAULT_MAX_LEADS },
      createdAt: new Date().toISOString()
    };
    await setDoc(docRef, newProfile);
    currentProfile = newProfile;
  }
  atualizarInterfaceUsuario();
}

async function atualizarPerfil(updates) {
  if (!currentUser) return;
  const { doc, updateDoc } = window;
  const docRef = doc(window.firebaseDb, "users", currentUser.uid);
  await updateDoc(docRef, updates);
  if (currentProfile) Object.assign(currentProfile, updates);
  atualizarInterfaceUsuario();
}

// ==================== UI ====================
function mostrarTelaLogin() {
  authContainer.style.display = "flex";
  appContainer.style.display = "none";
  document.getElementById("loginForm").classList.remove("hidden");
  document.getElementById("registerForm").classList.add("hidden");
  document.getElementById("loginError").textContent = "";
  document.getElementById("registerError").textContent = "";
}

function mostrarApp() {
  authContainer.style.display = "none";
  appContainer.style.display = "block";
  atualizarInterfaceUsuario();
  carregarConfiguracoesUsuario();
  leadsAtuais = gerarLeadsMock({ nicho: "pizzaria", cidade: "São Paulo", estado: "SP", quantidade: 10, avaliacaoMinima: 0 });
  aplicarFiltrosEOrdenacao();
}

function atualizarInterfaceUsuario() {
  if (!currentProfile) return;
  userEmailSpan.textContent = currentProfile.email;
  const creditos = currentProfile.creditos;
  creditosSpan.textContent = creditos >= 999999 ? "∞ (demo)" : String(creditos);
  document.getElementById("apiKey").value = currentProfile.apiKeys?.googleApiKey || "";
  document.getElementById("serpApiKey").value = currentProfile.apiKeys?.serpApiKey || "";
  const adminSection = document.getElementById("adminSection");
  adminSection.style.display = currentProfile.isSuperAdmin ? "block" : "none";
  atualizarLeadsRestantes();
}

function atualizarLeadsRestantes() {
  if (!currentProfile) { remainingLeadsSpan.textContent = "---"; return; }
  const tipoBusca = document.getElementById("tipoBusca").value;
  let custoPorLead = currentProfile.costPerApi?.[tipoBusca];
  if (custoPorLead === undefined) custoPorLead = 1;
  if (custoPorLead === 0) { remainingLeadsSpan.textContent = "∞ (simulação)"; return; }
  const leadsRestantes = Math.floor(currentProfile.creditos / custoPorLead);
  remainingLeadsSpan.textContent = String(leadsRestantes);
}

// ==================== CONFIGURAÇÕES DO USUÁRIO (LOCAL) ====================
function salvarConfiguracoesUsuario() {
  const delay = parseInt(document.getElementById("delayRequests").value);
  const timeout = parseInt(document.getElementById("timeout").value);
  const minRating = parseFloat(document.getElementById("minRating").value);
  localStorage.setItem(`user_config_${currentUser.uid}`, JSON.stringify({ delay, timeout, minRating }));
  alert("Configurações locais salvas.");
}
function carregarConfiguracoesUsuario() {
  if (!currentUser) return;
  const saved = localStorage.getItem(`user_config_${currentUser.uid}`);
  if (saved) {
    try {
      const cfg = JSON.parse(saved);
      document.getElementById("delayRequests").value = cfg.delay;
      document.getElementById("timeout").value = cfg.timeout;
      document.getElementById("minRating").value = cfg.minRating;
    } catch(e) {}
  }
}

// ==================== CRÉDITOS E CHAVES ====================
async function atualizarChavesAPI(googleKey, serpKey) {
  await atualizarPerfil({ apiKeys: { googleApiKey: googleKey, serpApiKey: serpKey } });
}

async function consumirCreditos(apiTipo, quantidadeLeads) {
  if (!currentProfile) return false;
  const custoPorLead = currentProfile.costPerApi?.[apiTipo] ?? 1;
  const custoTotal = custoPorLead * quantidadeLeads;
  if (currentProfile.creditos >= custoTotal) {
    const novosCreditos = currentProfile.creditos - custoTotal;
    await atualizarPerfil({ creditos: novosCreditos });
    return true;
  }
  return false;
}

// ==================== TABELA ====================
function aplicarFiltrosEOrdenacao() {
  let filtrados = leadsAtuais.filter(lead =>
    lead.nome.toLowerCase().includes(termoBuscaTabela.toLowerCase()) ||
    lead.telefone.includes(termoBuscaTabela) ||
    lead.endereco.toLowerCase().includes(termoBuscaTabela.toLowerCase()) ||
    lead.categoria.toLowerCase().includes(termoBuscaTabela.toLowerCase())
  );
  filtrados.sort((a,b) => {
    let va = a[ordenacao.coluna], vb = b[ordenacao.coluna];
    if (typeof va === "string") return ordenacao.direcao === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    return ordenacao.direcao === "asc" ? va - vb : vb - va;
  });
  leadsFiltrados = filtrados;
  paginaAtual = 1;
  renderizarTabela();
  renderizarPaginacao();
}

function renderizarTabela() {
  if (!tabelaBody) return;
  const inicio = (paginaAtual-1)*itensPorPagina;
  const leadsPagina = leadsFiltrados.slice(inicio, inicio+itensPorPagina);
  resultadosCountSpan.textContent = `${leadsFiltrados.length} leads encontrados`;
  tabelaBody.innerHTML = leadsPagina.map(lead => `
    <tr class="border-t border-gray-700 hover:bg-gray-800">
      <td class="px-4 py-3">${escapeHtml(lead.nome)}</td>
      <td class="px-4 py-3">${escapeHtml(lead.telefone)}</td>
      <td class="px-4 py-3">${escapeHtml(lead.endereco)}</td>
      <td class="px-4 py-3"><a href="https://${escapeHtml(lead.website)}" target="_blank">${escapeHtml(lead.website)}</a></td>
      <td class="px-4 py-3">${escapeHtml(lead.categoria)}</td>
      <td class="px-4 py-3">${lead.avaliacao} ★</td>
      <td class="px-4 py-3">${lead.quantidadeReviews}</td>
      <td class="px-4 py-3">${lead.latitude.toFixed(4)}</td>
      <td class="px-4 py-3">${lead.longitude.toFixed(4)}</td>
    </tr>
  `).join("");
}

function renderizarPaginacao() {
  const total = Math.ceil(leadsFiltrados.length / itensPorPagina);
  if (total <= 1) { paginationDiv.innerHTML = ""; return; }
  let html = `<button class="prev-btn" ${paginaAtual===1?"disabled":""}>Anterior</button>`;
  for (let i=1; i<=Math.min(total,10); i++) {
    html += `<button class="pagina-btn ${i===paginaAtual?"active":""}" data-pagina="${i}">${i}</button>`;
  }
  html += `<button class="next-btn" ${paginaAtual===total?"disabled":""}>Próximo</button>`;
  paginationDiv.innerHTML = html;
  document.querySelectorAll(".pagina-btn").forEach(btn => btn.addEventListener("click",(e)=>{
    paginaAtual = parseInt(e.target.dataset.pagina);
    renderizarTabela(); renderizarPaginacao();
  }));
  document.querySelector(".prev-btn")?.addEventListener("click",()=>{ if(paginaAtual>1){ paginaAtual--; renderizarTabela(); renderizarPaginacao(); } });
  document.querySelector(".next-btn")?.addEventListener("click",()=>{ if(paginaAtual<total){ paginaAtual++; renderizarTabela(); renderizarPaginacao(); } });
}

function ordenarTabela(coluna) {
  if (ordenacao.coluna === coluna) ordenacao.direcao = ordenacao.direcao === "asc" ? "desc" : "asc";
  else { ordenacao.coluna = coluna; ordenacao.direcao = "asc"; }
  aplicarFiltrosEOrdenacao();
}

// ==================== EXPORTAÇÕES ====================
function exportarCSV() { /* mesmo código da versão anterior */ alert("Implementar exportação"); }
function exportarJSON() { alert("Implementar exportação"); }
function exportarXLSX() { alert("Implementar exportação"); }
function copiarDadosTabela() { alert("Implementar cópia"); }

// ==================== PROSPECÇÃO ====================
async function iniciarProspeccao() {
  const nicho = document.getElementById("nicho").value;
  const cidade = document.getElementById("cidade").value;
  const estado = document.getElementById("estado").value;
  const keyword = document.getElementById("palavraChave").value;
  let quantidade = parseInt(document.getElementById("quantidade").value);
  const tipoBusca = document.getElementById("tipoBusca").value;
  const avaliacaoMin = parseFloat(document.getElementById("minRating").value) || 0;
  if (isNaN(quantidade) || quantidade<1) quantidade=10;
  const maxPerm = currentProfile.limits?.maxLeadsPerSearch ?? DEFAULT_MAX_LEADS;
  if (quantidade > maxPerm) { alert(`Limite: ${maxPerm}`); quantidade = maxPerm; document.getElementById("quantidade").value = quantidade; }
  const custoPorLead = currentProfile.costPerApi?.[tipoBusca] ?? 1;
  const custoTotal = custoPorLead * quantidade;
  if (custoPorLead > 0 && currentProfile.creditos < custoTotal) {
    alert(`Créditos insuficientes. Solicite upgrade.`);
    abrirModalUpgrade();
    return;
  }
  if (custoPorLead > 0) {
    if (!confirm(`Consumirá ${custoTotal} créditos. Continuar?`)) return;
    const consumido = await consumirCreditos(tipoBusca, quantidade);
    if (!consumido) { alert("Erro ao consumir créditos."); return; }
    atualizarInterfaceUsuario();
  }
  const btn = document.getElementById("btnIniciar");
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Prospectando...';
  await new Promise(r => setTimeout(r,1500));
  const leads = gerarLeadsMock({ nicho: keyword||nicho, cidade, estado, quantidade, avaliacaoMinima: avaliacaoMin });
  leadsAtuais = leads;
  termoBuscaTabela = "";
  document.getElementById("buscaTabela").value = "";
  aplicarFiltrosEOrdenacao();
  btn.disabled = false;
  btn.innerHTML = original;
  alert(`${leads.length} leads gerados.`);
}

// ==================== UPGRADE ====================
function abrirModalUpgrade() { document.getElementById("creditsModal").classList.remove("hidden"); }
function fecharModalUpgrade() { document.getElementById("creditsModal").classList.add("hidden"); }
function solicitarUpgradeWhatsApp() {
  const email = currentProfile?.email || "";
  const msg = `Olá, gostaria de informações sobre liberação de acesso. Meu e-mail: ${email}`;
  window.open(`https://web.whatsapp.com/send?phone=5534997824990&text=${encodeURIComponent(msg)}`,'_blank');
  fecharModalUpgrade();
}
function solicitarUpgradeEmail() {
  const email = currentProfile?.email || "";
  window.location.href = `mailto:websitelogx@gmail.com?subject=Informações%20de%20liberação&body=Meu%20e-mail:%20${email}`;
  fecharModalUpgrade();
}

// ==================== ADMIN (apenas para superusuário) ====================
function abrirAdminPanel() { document.getElementById("adminModal").classList.remove("hidden"); carregarListaUsuarios(); }
function fecharAdminPanel() { document.getElementById("adminModal").classList.add("hidden"); }
async function carregarListaUsuarios() { /* carrega lista do Firestore */ alert("Função admin não implementada neste exemplo simplificado"); }

// ==================== EVENTOS ====================
function initEventListeners() {
  document.getElementById("btnIniciar").addEventListener("click", iniciarProspeccao);
  document.getElementById("saveConfig").addEventListener("click", salvarConfiguracoesUsuario);
  document.getElementById("logoutBtn").addEventListener("click", () => window.firebaseAuth.signOut());
  document.getElementById("solicitarCreditosBtn").addEventListener("click", abrirModalUpgrade);
  document.getElementById("closeModal").addEventListener("click", fecharModalUpgrade);
  document.getElementById("whatsappUpgrade").addEventListener("click", solicitarUpgradeWhatsApp);
  document.getElementById("emailUpgrade").addEventListener("click", solicitarUpgradeEmail);
  document.getElementById("openAdminPanel").addEventListener("click", abrirAdminPanel);
  document.getElementById("closeAdminModal").addEventListener("click", fecharAdminPanel);
  document.getElementById("tipoBusca").addEventListener("change", () => atualizarLeadsRestantes());
  document.getElementById("buscaTabela").addEventListener("input", (e) => { termoBuscaTabela = e.target.value; aplicarFiltrosEOrdenacao(); });
  document.querySelectorAll(".sortable-header").forEach(h => h.addEventListener("click", () => ordenarTabela(h.dataset.coluna)));
  document.getElementById("doLogin").addEventListener("click", async () => {
    const email = document.getElementById("loginEmail").value;
    const senha = document.getElementById("loginSenha").value;
    try {
      await window.signInWithEmailAndPassword(window.firebaseAuth, email, senha);
    } catch(e) {
      document.getElementById("loginError").textContent = "E-mail ou senha inválidos.";
    }
  });
  document.getElementById("doRegister").addEventListener("click", async () => {
    const email = document.getElementById("regEmail").value;
    const senha = document.getElementById("regSenha").value;
    try {
      await window.createUserWithEmailAndPassword(window.firebaseAuth, email, senha);
    } catch(e) {
      document.getElementById("registerError").textContent = "Erro ao cadastrar. Verifique os dados.";
    }
  });
  document.getElementById("showRegister").addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("loginForm").classList.add("hidden");
    document.getElementById("registerForm").classList.remove("hidden");
  });
  document.getElementById("showLogin").addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("registerForm").classList.add("hidden");
    document.getElementById("loginForm").classList.remove("hidden");
  });
}

function init() {
  appContainer = document.getElementById("appContainer");
  authContainer = document.getElementById("authContainer");
  userEmailSpan = document.getElementById("userEmail");
  creditosSpan = document.getElementById("creditosSaldo");
  remainingLeadsSpan = document.getElementById("remainingLeads");
  tabelaBody = document.getElementById("leadsTableBody");
  paginationDiv = document.getElementById("pagination");
  buscaTabelaInput = document.getElementById("buscaTabela");
  resultadosCountSpan = document.getElementById("resultadosCount");
  carregarTema();
  initFirebase();
  initEventListeners();
}

function carregarTema() {
  const saved = localStorage.getItem("theme");
  if (saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches))
    document.documentElement.classList.add("dark");
  else
    document.documentElement.classList.remove("dark");
}
function escapeHtml(str) {
  return str.replace(/[&<>]/g, m => m === "&" ? "&amp;" : m === "<" ? "&lt;" : "&gt;");
}
window.addEventListener("DOMContentLoaded", init);
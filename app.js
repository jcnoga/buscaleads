// app.js - Versão com Firebase Authentication e Firestore (código compilado)
// Configure seu projeto Firebase e substitua as credenciais no index.html

// ==================== INTERFACES (convertidas para JS) ====================

// Estado da aplicação
let currentUser = null;
let currentProfile = null;
let leadsAtuais = [];
let leadsFiltrados = [];
let paginaAtual = 1;
const itensPorPagina = 10;
let ordenacao = { coluna: "nome", direcao: "asc" };
let termoBuscaTabela = "";

// Elementos DOM
let appContainer, authContainer, userEmailSpan, creditosSpan, remainingLeadsSpan;
let tabelaBody, paginationDiv, buscaTabelaInput, resultadosCountSpan;

// Constantes
const DEFAULT_MAX_LEADS = 120;
const SUPER_ADMIN_EMAIL = "admin@leadscraper.com";

// ==================== MOCK DATA ====================

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

// ==================== FUNÇÕES DE AUTENTICAÇÃO E FIREBASE ====================

function initFirebase() {
    const auth = window.firebaseAuth;
    const db = window.firebaseDb;
    const signInWithEmailAndPassword = window.signInWithEmailAndPassword;
    const createUserWithEmailAndPassword = window.createUserWithEmailAndPassword;
    const signOut = window.signOut;
    const onAuthStateChanged = window.onAuthStateChanged;
    const doc = window.doc;
    const getDoc = window.getDoc;
    const setDoc = window.setDoc;
    const updateDoc = window.updateDoc;
    const collection = window.collection;
    const query = window.query;
    const where = window.where;
    const getDocs = window.getDocs;

    // Disponibilizar funções globalmente para uso posterior
    window.__firestore = { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs };
    window.__auth = { auth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut };

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
    const { doc, getDoc } = window.__firestore;
    const docRef = doc(window.firebaseDb, "users", uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        currentProfile = docSnap.data();
    } else {
        // Criar perfil padrão
        const newProfile = {
            email: currentUser.email,
            creditos: 999999,
            isSuperAdmin: currentUser.email === SUPER_ADMIN_EMAIL,
            apiKeys: { googleApiKey: "", serpApiKey: "" },
            costPerApi: { googlePlacesMock: 0, serpApi: 1, apify: 2 },
            limits: { maxLeadsPerSearch: DEFAULT_MAX_LEADS },
            createdAt: new Date()
        };
        await setDoc(docRef, newProfile);
        currentProfile = newProfile;
    }
    atualizarInterfaceUsuario();
}

async function atualizarPerfil(updates) {
    if (!currentUser) return;
    const { doc, updateDoc } = window.__firestore;
    const docRef = doc(window.firebaseDb, "users", currentUser.uid);
    await updateDoc(docRef, updates);
    if (currentProfile) Object.assign(currentProfile, updates);
    atualizarInterfaceUsuario();
}

async function atualizarChavesAPI(googleKey, serpKey) {
    await atualizarPerfil({ apiKeys: { googleApiKey: googleKey, serpApiKey: serpKey } });
}

async function atualizarCustoPorAPI(custos) {
    const novosCustos = { ...currentProfile?.costPerApi, ...custos };
    await atualizarPerfil({ costPerApi: novosCustos });
}

async function atualizarLimiteUsuario(maxLeads) {
    await atualizarPerfil({ limits: { maxLeadsPerSearch: maxLeads } });
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

async function adicionarCreditos(email, quantidade) {
    const { collection, query, where, getDocs, doc, updateDoc } = window.__firestore;
    const db = window.firebaseDb;
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("email", "==", email));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach(async (docSnap) => {
        const userData = docSnap.data();
        const novosCreditos = (userData.creditos || 0) + quantidade;
        await updateDoc(doc(db, "users", docSnap.id), { creditos: novosCreditos });
    });
}

// ==================== INTERFACE DO USUÁRIO ====================

function mostrarTelaLogin() {
    if (authContainer) authContainer.style.display = "flex";
    if (appContainer) appContainer.style.display = "none";
    document.getElementById("loginForm")?.classList.remove("hidden");
    document.getElementById("registerForm")?.classList.add("hidden");
    const loginError = document.getElementById("loginError");
    const registerError = document.getElementById("registerError");
    if (loginError) loginError.textContent = "";
    if (registerError) registerError.textContent = "";
}

function mostrarApp() {
    if (authContainer) authContainer.style.display = "none";
    if (appContainer) appContainer.style.display = "block";
    atualizarInterfaceUsuario();
    carregarConfiguracoesUsuario();
    leadsAtuais = gerarLeadsMock({
        nicho: "pizzaria",
        cidade: "São Paulo",
        estado: "SP",
        quantidade: 10,
        avaliacaoMinima: 0,
    });
    aplicarFiltrosEOrdenacao();
}

function atualizarInterfaceUsuario() {
    if (!currentProfile) return;
    userEmailSpan.textContent = currentProfile.email;
    const creditos = currentProfile.creditos;
    creditosSpan.textContent = creditos >= 999999 ? "∞ (demo)" : String(creditos);
    const apiKeyInput = document.getElementById("apiKey");
    const serpKeyInput = document.getElementById("serpApiKey");
    if (apiKeyInput) apiKeyInput.value = currentProfile.apiKeys?.googleApiKey || "";
    if (serpKeyInput) serpKeyInput.value = currentProfile.apiKeys?.serpApiKey || "";
    const adminSection = document.getElementById("adminSection");
    if (currentProfile.isSuperAdmin) {
        if (adminSection) adminSection.style.display = "block";
    } else {
        if (adminSection) adminSection.style.display = "none";
    }
    atualizarLeadsRestantes();
}

function atualizarLeadsRestantes() {
    if (!currentProfile) {
        if (remainingLeadsSpan) remainingLeadsSpan.textContent = "---";
        return;
    }
    const tipoBuscaSelect = document.getElementById("tipoBusca");
    const tipoBusca = tipoBuscaSelect ? tipoBuscaSelect.value : "googlePlacesMock";
    let custoPorLead = currentProfile.costPerApi?.[tipoBusca];
    if (custoPorLead === undefined) custoPorLead = 1;
    if (custoPorLead === 0) {
        if (remainingLeadsSpan) remainingLeadsSpan.textContent = "∞ (simulação)";
        return;
    }
    const leadsRestantes = Math.floor(currentProfile.creditos / custoPorLead);
    if (remainingLeadsSpan) remainingLeadsSpan.textContent = String(leadsRestantes);
}

function salvarChavesDoUsuario() {
    const googleKey = document.getElementById("apiKey")?.value || "";
    const serpKey = document.getElementById("serpApiKey")?.value || "";
    atualizarChavesAPI(googleKey, serpKey);
    alert("Chaves de API salvas com segurança no Firebase.");
}

// ==================== FUNÇÕES DA TABELA ====================

function aplicarFiltrosEOrdenacao() {
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

function renderizarTabela() {
    if (!tabelaBody) return;
    const inicio = (paginaAtual - 1) * itensPorPagina;
    const fim = inicio + itensPorPagina;
    const leadsPagina = leadsFiltrados.slice(inicio, fim);
    if (resultadosCountSpan) resultadosCountSpan.textContent = `${leadsFiltrados.length} leads encontrados`;
    tabelaBody.innerHTML = leadsPagina.map(lead => `
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
    `).join("");
}

function renderizarPaginacao() {
    if (!paginationDiv) return;
    const totalPaginas = Math.ceil(leadsFiltrados.length / itensPorPagina);
    if (totalPaginas <= 1) {
        paginationDiv.innerHTML = "";
        return;
    }
    let paginasHtml = "";
    for (let i = 1; i <= Math.min(totalPaginas, 10); i++) {
        paginasHtml += `<button class="pagina-btn px-3 py-1 rounded-lg transition ${i === paginaAtual ? "bg-purple-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}" data-pagina="${i}">${i}</button>`;
    }
    paginationDiv.innerHTML = `
        <button class="prev-btn px-3 py-1 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 transition" ${paginaAtual === 1 ? "disabled" : ""}>Anterior</button>
        ${paginasHtml}
        <button class="next-btn px-3 py-1 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 transition" ${paginaAtual === totalPaginas ? "disabled" : ""}>Próximo</button>
    `;
    document.querySelectorAll(".pagina-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            paginaAtual = parseInt(e.target.dataset.pagina || "1", 10);
            renderizarTabela();
            renderizarPaginacao();
        });
    });
    const prevBtn = document.querySelector(".prev-btn");
    const nextBtn = document.querySelector(".next-btn");
    if (prevBtn) prevBtn.addEventListener("click", () => { if (paginaAtual > 1) { paginaAtual--; renderizarTabela(); renderizarPaginacao(); } });
    if (nextBtn) nextBtn.addEventListener("click", () => { if (paginaAtual < totalPaginas) { paginaAtual++; renderizarTabela(); renderizarPaginacao(); } });
}

function ordenarTabela(coluna) {
    if (ordenacao.coluna === coluna) {
        ordenacao.direcao = ordenacao.direcao === "asc" ? "desc" : "asc";
    } else {
        ordenacao.coluna = coluna;
        ordenacao.direcao = "asc";
    }
    aplicarFiltrosEOrdenacao();
}

// ==================== EXPORTAÇÕES ====================

function exportarCSV() {
    if (leadsFiltrados.length === 0) { alert("Nenhum lead para exportar."); return; }
    const headers = ["Nome", "Telefone", "Endereço", "Website", "Categoria", "Avaliação", "Reviews", "Latitude", "Longitude"];
    const rows = leadsFiltrados.map(lead => [lead.nome, lead.telefone, lead.endereco, lead.website, lead.categoria, lead.avaliacao, lead.quantidadeReviews, lead.latitude, lead.longitude]);
    const csvContent = [headers, ...rows].map(row => row.join(",")).join("\n");
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

function exportarJSON() {
    if (leadsFiltrados.length === 0) { alert("Nenhum lead para exportar."); return; }
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

function exportarXLSX() {
    if (leadsFiltrados.length === 0) { alert("Nenhum lead para exportar."); return; }
    let tabelaHTML = `<html><head><meta charset="UTF-8"><title>Leads</title></head><body><table border="1"><thead><tr><th>Nome</th><th>Telefone</th><th>Endereço</th><th>Website</th><th>Categoria</th><th>Avaliação</th><th>Reviews</th><th>Latitude</th><th>Longitude</th></tr></thead><tbody>`;
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

function copiarDadosTabela() {
    if (leadsFiltrados.length === 0) { alert("Nenhum dado para copiar."); return; }
    const texto = leadsFiltrados.map(lead => `${lead.nome}\t${lead.telefone}\t${lead.endereco}\t${lead.website}\t${lead.categoria}\t${lead.avaliacao}\t${lead.quantidadeReviews}`).join("\n");
    navigator.clipboard.writeText(texto).then(() => alert(`${leadsFiltrados.length} leads copiados.`)).catch(() => alert("Erro ao copiar."));
}

// ==================== PROSPECÇÃO ====================

async function iniciarProspeccao() {
    if (!currentProfile) return;
    const nicho = document.getElementById("nicho")?.value || "";
    const cidade = document.getElementById("cidade")?.value || "";
    const estado = document.getElementById("estado")?.value || "";
    const keyword = document.getElementById("palavraChave")?.value || "";
    let quantidade = parseInt(document.getElementById("quantidade")?.value || "50");
    const tipoBusca = document.getElementById("tipoBusca")?.value || "googlePlacesMock";
    const avaliacaoMin = parseFloat(document.getElementById("minRating")?.value || "0");
    if (isNaN(quantidade) || quantidade < 1) quantidade = 10;
    const maxPermitido = currentProfile.limits?.maxLeadsPerSearch ?? DEFAULT_MAX_LEADS;
    if (quantidade > maxPermitido) {
        alert(`Limite máximo para este usuário é ${maxPermitido} leads por busca.`);
        quantidade = maxPermitido;
        const qtdInput = document.getElementById("quantidade");
        if (qtdInput) qtdInput.value = String(quantidade);
    }
    const custoPorLead = currentProfile.costPerApi?.[tipoBusca] ?? 1;
    const custoTotal = custoPorLead * quantidade;
    if (custoPorLead > 0 && currentProfile.creditos < custoTotal) {
        alert(`Créditos insuficientes. Você possui ${currentProfile.creditos} créditos. Necessário ${custoTotal}. Solicite upgrade.`);
        abrirModalUpgrade();
        return;
    }
    if (custoPorLead > 0) {
        if (!confirm(`Esta operação consumirá ${custoTotal} créditos (${custoPorLead} por lead). Deseja continuar?`)) return;
        const consumido = await consumirCreditos(tipoBusca, quantidade);
        if (!consumido) {
            alert("Erro ao consumir créditos.");
            return;
        }
        alert(`Créditos consumidos: ${custoTotal}. Saldo restante: ${currentProfile.creditos}`);
    } else {
        alert(`Modo simulação (${tipoBusca}) - sem consumo de créditos.`);
    }
    const btn = document.getElementById("btnIniciar");
    const original = btn ? btn.innerHTML : "";
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Prospectando...';
    }
    await new Promise(r => setTimeout(r, 1500));
    const leads = gerarLeadsMock({ nicho: keyword || nicho, cidade, estado, quantidade, avaliacaoMinima: avaliacaoMin });
    leadsAtuais = leads;
    termoBuscaTabela = "";
    const buscaInput = document.getElementById("buscaTabela");
    if (buscaInput) buscaInput.value = "";
    aplicarFiltrosEOrdenacao();
    const notif = document.createElement("div");
    notif.className = "fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-fade-in";
    notif.innerHTML = `<i class="fas fa-check-circle"></i> ${leads.length} leads gerados.`;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = original;
    }
}

// ==================== UPGRADE ====================

function abrirModalUpgrade() {
    const modal = document.getElementById("creditsModal");
    if (modal) modal.classList.remove("hidden");
}
function fecharModalUpgrade() {
    const modal = document.getElementById("creditsModal");
    if (modal) modal.classList.add("hidden");
}
function solicitarUpgradeWhatsApp() {
    const email = currentProfile?.email || "";
    const mensagem = `Olá, gostaria de informações sobre liberação de acesso. Meu e-mail: ${email}`;
    const telefone = "5534997824990";
    const url = `https://web.whatsapp.com/send?phone=${telefone}&text=${encodeURIComponent(mensagem)}`;
    window.open(url, '_blank');
    fecharModalUpgrade();
}
function solicitarUpgradeEmail() {
    const email = currentProfile?.email || "";
    window.location.href = `mailto:websitelogx@gmail.com?subject=Informações%20de%20liberação&body=Meu%20e-mail:%20${email}`;
    fecharModalUpgrade();
}

// ==================== ADMIN ====================

async function carregarListaUsuariosAdmin() {
    if (!currentProfile?.isSuperAdmin) return;
    const { collection, getDocs, doc, updateDoc } = window.__firestore;
    const db = window.firebaseDb;
    const usersRef = collection(db, "users");
    const querySnapshot = await getDocs(usersRef);
    const container = document.getElementById("usersList");
    if (!container) return;
    container.innerHTML = "";
    querySnapshot.forEach((docSnap) => {
        const user = docSnap.data();
        const uid = docSnap.id;
        const div = document.createElement("div");
        div.className = "user-item";
        div.innerHTML = `
            <strong>${escapeHtml(user.email)}</strong> ${user.isSuperAdmin ? '(Super Admin)' : ''}
            <div class="user-chaves">
                <input type="text" id="googleKey_${uid}" placeholder="Google API Key" value="${user.apiKeys?.googleApiKey || ''}">
                <input type="text" id="serpKey_${uid}" placeholder="SerpApi Key" value="${user.apiKeys?.serpApiKey || ''}">
                <button onclick="adminSalvarChaves('${uid}')">Salvar Chaves</button>
            </div>
            <div class="user-costs">
                <label>Custo Mock:</label><input type="number" id="costMock_${uid}" value="${user.costPerApi?.googlePlacesMock ?? 0}" step="0.1" style="width:80px">
                <label>SerpApi:</label><input type="number" id="costSerp_${uid}" value="${user.costPerApi?.serpApi ?? 1}" step="0.1" style="width:80px">
                <label>Apify:</label><input type="number" id="costApify_${uid}" value="${user.costPerApi?.apify ?? 2}" step="0.1" style="width:80px">
                <button onclick="adminSalvarCosts('${uid}')">Salvar Custos</button>
            </div>
            <div class="user-limits">
                <label>Máx leads:</label><input type="number" id="limit_${uid}" value="${user.limits?.maxLeadsPerSearch ?? DEFAULT_MAX_LEADS}" style="width:100px">
                <button onclick="adminSalvarLimite('${uid}')">Atualizar Limite</button>
                <label>Créditos:</label><input type="number" id="creditos_${uid}" value="${user.creditos}" style="width:100px">
                <button onclick="adminSalvarCreditos('${uid}')">Atualizar Créditos</button>
            </div>
        `;
        container.appendChild(div);
    });
    window.adminSalvarChaves = async (uid) => {
        const googleKey = document.getElementById(`googleKey_${uid}`)?.value || "";
        const serpKey = document.getElementById(`serpKey_${uid}`)?.value || "";
        const { doc, updateDoc } = window.__firestore;
        const db = window.firebaseDb;
        const userRef = doc(db, "users", uid);
        await updateDoc(userRef, { apiKeys: { googleApiKey: googleKey, serpApiKey: serpKey } });
        alert("Chaves atualizadas.");
    };
    window.adminSalvarCosts = async (uid) => {
        const costMock = parseFloat(document.getElementById(`costMock_${uid}`)?.value || "0");
        const costSerp = parseFloat(document.getElementById(`costSerp_${uid}`)?.value || "0");
        const costApify = parseFloat(document.getElementById(`costApify_${uid}`)?.value || "0");
        const { doc, updateDoc } = window.__firestore;
        const db = window.firebaseDb;
        const userRef = doc(db, "users", uid);
        await updateDoc(userRef, { costPerApi: { googlePlacesMock: costMock, serpApi: costSerp, apify: costApify } });
        alert("Custos atualizados.");
        if (uid === currentUser.uid) atualizarLeadsRestantes();
    };
    window.adminSalvarLimite = async (uid) => {
        const maxLeads = parseInt(document.getElementById(`limit_${uid}`)?.value || "120");
        if (!isNaN(maxLeads)) {
            const { doc, updateDoc } = window.__firestore;
            const db = window.firebaseDb;
            const userRef = doc(db, "users", uid);
            await updateDoc(userRef, { limits: { maxLeadsPerSearch: maxLeads } });
            alert("Limite atualizado.");
        }
    };
    window.adminSalvarCreditos = async (uid) => {
        const novosCreditos = parseFloat(document.getElementById(`creditos_${uid}`)?.value || "0");
        if (!isNaN(novosCreditos)) {
            const { doc, updateDoc } = window.__firestore;
            const db = window.firebaseDb;
            const userRef = doc(db, "users", uid);
            await updateDoc(userRef, { creditos: novosCreditos });
            alert("Créditos atualizados.");
            if (uid === currentUser.uid) atualizarInterfaceUsuario();
        }
    };
}

// ==================== CONFIGURAÇÕES LOCAIS ====================

function salvarConfiguracoesUsuario() {
    const delay = parseInt(document.getElementById("delayRequests")?.value || "500");
    const timeout = parseInt(document.getElementById("timeout")?.value || "30000");
    const minRating = parseFloat(document.getElementById("minRating")?.value || "0");
    if (currentUser) {
        localStorage.setItem(`user_config_${currentUser.uid}`, JSON.stringify({ delay, timeout, minRating }));
    }
    alert("Configurações locais salvas.");
}

function carregarConfiguracoesUsuario() {
    if (!currentUser) return;
    const saved = localStorage.getItem(`user_config_${currentUser.uid}`);
    if (saved) {
        try {
            const cfg = JSON.parse(saved);
            const delayInput = document.getElementById("delayRequests");
            const timeoutInput = document.getElementById("timeout");
            const minRatingInput = document.getElementById("minRating");
            if (delayInput) delayInput.value = cfg.delay;
            if (timeoutInput) timeoutInput.value = cfg.timeout;
            if (minRatingInput) minRatingInput.value = cfg.minRating;
        } catch(e) {}
    }
}

// ==================== HELPERS ====================

function escapeHtml(str) {
    return str.replace(/[&<>]/g, m => m === "&" ? "&amp;" : m === "<" ? "&lt;" : "&gt;");
}

function alternarDarkMode() {
    const html = document.documentElement;
    if (html.classList.contains("dark")) {
        html.classList.remove("dark");
        localStorage.setItem("theme", "light");
    } else {
        html.classList.add("dark");
        localStorage.setItem("theme", "dark");
    }
}

function carregarTema() {
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
        document.documentElement.classList.add("dark");
    } else {
        document.documentElement.classList.remove("dark");
    }
}

// ==================== EVENTOS E INICIALIZAÇÃO ====================

function initEventListeners() {
    const btnIniciar = document.getElementById("btnIniciar");
    if (btnIniciar) btnIniciar.addEventListener("click", iniciarProspeccao);
    const saveConfig = document.getElementById("saveConfig");
    if (saveConfig) saveConfig.addEventListener("click", salvarConfiguracoesUsuario);
    const themeToggle = document.getElementById("themeToggle");
    if (themeToggle) themeToggle.addEventListener("click", alternarDarkMode);
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn && window.__auth) logoutBtn.addEventListener("click", () => window.__auth.signOut(window.firebaseAuth));
    const solicitarBtn = document.getElementById("solicitarCreditosBtn");
    if (solicitarBtn) solicitarBtn.addEventListener("click", abrirModalUpgrade);
    const closeModal = document.getElementById("closeModal");
    if (closeModal) closeModal.addEventListener("click", fecharModalUpgrade);
    const whatsappBtn = document.getElementById("whatsappUpgrade");
    if (whatsappBtn) whatsappBtn.addEventListener("click", solicitarUpgradeWhatsApp);
    const emailBtn = document.getElementById("emailUpgrade");
    if (emailBtn) emailBtn.addEventListener("click", solicitarUpgradeEmail);
    const openAdmin = document.getElementById("openAdminPanel");
    if (openAdmin) openAdmin.addEventListener("click", async () => {
        const adminModal = document.getElementById("adminModal");
        if (adminModal) adminModal.classList.remove("hidden");
        await carregarListaUsuariosAdmin();
    });
    const closeAdmin = document.getElementById("closeAdminModal");
    if (closeAdmin) closeAdmin.addEventListener("click", () => {
        const adminModal = document.getElementById("adminModal");
        if (adminModal) adminModal.classList.add("hidden");
    });
    const tipoBusca = document.getElementById("tipoBusca");
    if (tipoBusca) tipoBusca.addEventListener("change", () => atualizarLeadsRestantes());
    const exportCSV = document.getElementById("exportCSV");
    if (exportCSV) exportCSV.addEventListener("click", exportarCSV);
    const exportJSON = document.getElementById("exportJSON");
    if (exportJSON) exportJSON.addEventListener("click", exportarJSON);
    const exportXLSX = document.getElementById("exportXLSX");
    if (exportXLSX) exportXLSX.addEventListener("click", exportarXLSX);
    const copyTable = document.getElementById("copyTable");
    if (copyTable) copyTable.addEventListener("click", copiarDadosTabela);
    const buscaTabela = document.getElementById("buscaTabela");
    if (buscaTabela) buscaTabela.addEventListener("input", (e) => {
        termoBuscaTabela = e.target.value;
        aplicarFiltrosEOrdenacao();
    });
    document.querySelectorAll(".sortable-header").forEach(header => {
        header.addEventListener("click", () => {
            const coluna = header.getAttribute("data-coluna");
            if (coluna) ordenarTabela(coluna);
        });
    });
    // Autenticação via Firebase
    const doLogin = document.getElementById("doLogin");
    if (doLogin && window.__auth) {
        doLogin.addEventListener("click", async () => {
            const email = document.getElementById("loginEmail")?.value || "";
            const senha = document.getElementById("loginSenha")?.value || "";
            try {
                await window.__auth.signInWithEmailAndPassword(window.firebaseAuth, email, senha);
            } catch (error) {
                const loginError = document.getElementById("loginError");
                if (loginError) loginError.textContent = "E-mail ou senha inválidos.";
            }
        });
    }
    const doRegister = document.getElementById("doRegister");
    if (doRegister && window.__auth) {
        doRegister.addEventListener("click", async () => {
            const email = document.getElementById("regEmail")?.value || "";
            const senha = document.getElementById("regSenha")?.value || "";
            try {
                await window.__auth.createUserWithEmailAndPassword(window.firebaseAuth, email, senha);
            } catch (error) {
                const registerError = document.getElementById("registerError");
                if (registerError) registerError.textContent = "Erro ao cadastrar. Verifique os dados.";
            }
        });
    }
    const showRegister = document.getElementById("showRegister");
    if (showRegister) {
        showRegister.addEventListener("click", (e) => {
            e.preventDefault();
            document.getElementById("loginForm")?.classList.add("hidden");
            document.getElementById("registerForm")?.classList.remove("hidden");
        });
    }
    const showLogin = document.getElementById("showLogin");
    if (showLogin) {
        showLogin.addEventListener("click", (e) => {
            e.preventDefault();
            document.getElementById("registerForm")?.classList.add("hidden");
            document.getElementById("loginForm")?.classList.remove("hidden");
        });
    }
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

document.addEventListener("DOMContentLoaded", init);
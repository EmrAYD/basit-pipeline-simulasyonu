const instructions = [
  {
    id: 1,
    type: "ADD",
    text: "add x10, x5, x6",
    src1: "x5",
    src2: "x6",
    dest: "x10",
    color: "#48bb78",
    stall: false,
    position: 0,
  },
  {
    id: 2,
    type: "LW",
    text: "lw x3, 0(x2)",
    src1: "x2",
    dest: "x3",
    memOffset: 0,
    color: "#ed8936",
    stall: false,
    position: 0,
  },
  {
    id: 3,
    type: "SUB",
    text: "sub x4, x3, x1",
    src1: "x3",
    src2: "x1",
    dest: "x4",
    color: "#4299e1",
    stall: false,
    position: 0,
  },
  {
    id: 4,
    type: "SW",
    text: "sw x4, 4(x2)",
    src1: "x2",
    src2: "x4",
    memOffset: 1,
    color: "#805ad5",
    stall: false,
    position: 0,
  },
  {
    id: 5,
    type: "ADDI",
    text: "addi x7, x5, 10",
    src1: "x5",
    imm: 10,
    dest: "x7",
    color: "#667eea",
    stall: false,
    position: 0,
  },
];

const registers = {
  x0: 0, // zero (constant 0)
  x1: 5, // ra (return address)
  x2: 200, // sp (stack pointer)
  x3: 15, // gp (global pointer)
  x4: 20, // tp (thread pointer)
  x5: 25, // t0 (temporary)
  x6: 30, // t1 (temporary)
  x7: 35, // t2 (temporary)
  x8: 40, // s0/fp (saved/frame pointer)
  x9: 45, // s1 (saved register)
  x10: 50, // a0 (argument/return)
  x11: 55, // a1 (argument/return)
};

const memory = [100, 200, 300, 400, 500, 600, 700, 800];
const DEFAULT_REG_VALUES = [0, 5, 200, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const DEFAULT_MEM_VALUES = [100, 200, 300, 400, 500, 600, 700, 800];

let instructionQueue = [...instructions];
let pipelineStages = {
  if: [],
  id: [],
  ex: [],
  mem: [],
  wb: [],
};
let completedInstructions = [];
let cycleCount = 0;

// Tab handling
const tabButtons = document.querySelectorAll(".tab-button");
tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    // Remove active class from all buttons and panes
    tabButtons.forEach((btn) => btn.classList.remove("active"));
    document
      .querySelectorAll(".tab-pane")
      .forEach((pane) => pane.classList.remove("active"));

    // Add active class to clicked button and corresponding pane
    button.classList.add("active");
    const tabId = button.getAttribute("data-tab");
    document.getElementById(`${tabId}-tab`).classList.add("active");
  });
});

function updateUI() {
  // Update pipeline visualization
  for (const stage in pipelineStages) {
    const stageEl = document.getElementById(`${stage}-stage`);
    stageEl.innerHTML = "";

    pipelineStages[stage].forEach((inst) => {
      const instEl = document.createElement("div");
      instEl.className = "instruction";
      instEl.style.backgroundColor = inst.stall ? "#f56565" : inst.color;
      instEl.style.width = "100%"; // Genişlik %100 olarak ayarlandı

      // Komut metnini daha iyi göstermek için
      const textEl = document.createElement("span");
      textEl.textContent = inst.text;
      textEl.style.whiteSpace = "nowrap";
      textEl.style.overflow = "hidden";
      textEl.style.textOverflow = "ellipsis";
      instEl.appendChild(textEl);

      stageEl.appendChild(instEl);
    });
  }

  // Update registers
  for (const reg in registers) {
    const regEl = document.getElementById(reg);
    if (regEl) {
      regEl.textContent = registers[reg];
    }
  }

  // Update memory
  memory.forEach((val, idx) => {
    const memEl = document.getElementById(`mem-${idx}`);
    if (memEl) {
      memEl.textContent = val;
    }
  });

  // Update cycle count
  document.getElementById("cycle-count").textContent = cycleCount;

  // Update completed instructions
  const completedList = document.getElementById("completed-list");
  completedList.innerHTML = "";
  completedInstructions.forEach((inst) => {
    const instEl = document.createElement("div");
    instEl.className = "completed-instruction";
    instEl.textContent = inst.text;
    completedList.appendChild(instEl);
  });

  // Update hazard display
  const hazardDisplay = document.getElementById("hazard-display");
  hazardDisplay.innerHTML = "";

  let hasHazard = false;
  for (const stage in pipelineStages) {
    pipelineStages[stage].forEach((inst) => {
      if (inst.stall) {
        hasHazard = true;
      }
    });
  }

  if (hasHazard) {
    const hazardInfo = document.createElement("div");
    hazardInfo.className = "hazard-info";
    hazardInfo.textContent =
      "Data Hazard Tespit Edildi! Stall uygulanıyor.";
    hazardDisplay.appendChild(hazardInfo);
  }
}

function checkHazards() {
  if (pipelineStages.id.length === 0) return false;
  const idInst = pipelineStages.id[0];
  const src1 = idInst.src1;
  let src2 = (idInst.type === "SW") ? idInst.src2 : idInst.src2 || null;

  // EX, MEM, WB aşamalarındaki komutları kontrol et
  const stagesToCheck = [...pipelineStages.ex, ...pipelineStages.mem];
  
  return stagesToCheck.some(inst => {
    if (!inst.dest || inst.dest === "x0") return false;
    return inst.dest === src1 || inst.dest === src2;
  });
}

function step() {
  cycleCount++;

  // Move instructions through pipeline
  // WB stage -> Completed
  if (pipelineStages.wb.length > 0) {
    const inst = pipelineStages.wb.shift();
    completedInstructions.push(inst);

    // Yazmaç güncelleme işlemleri
    if (inst.dest && inst.dest !== "x0") { // x0 yazmaç değeri her zaman 0 olmalı
      if (inst.type === "ADD") {
        registers[inst.dest] = registers[inst.src1] + registers[inst.src2];
      } else if (inst.type === "SUB") {
        registers[inst.dest] = registers[inst.src1] - registers[inst.src2];
      } else if (inst.type === "LW") {
        // LW komutunun sonucu MEM aşamasında memory'den okunur, WB aşamasında yazmaça yazılır
        registers[inst.dest] = memory[inst.memOffset];
      } else if (inst.type === "ADDI") {
        registers[inst.dest] = registers[inst.src1] + inst.imm;
      }
    }
  }

  // MEM stage -> WB
  if (pipelineStages.mem.length > 0) {
    const inst = pipelineStages.mem.shift();

    // SW komutu için bellek yazma işlemi MEM aşamasında gerçekleşir
    if (inst.type === "SW") {
      memory[inst.memOffset] = registers[inst.src2];
    }

    // Komutu WB aşamasına ilerlet
    pipelineStages.wb.push(inst);
  }

  // EX stage -> MEM
  if (pipelineStages.ex.length > 0) {
    const inst = pipelineStages.ex.shift();
    pipelineStages.mem.push(inst);
  }

  // Check for hazards
  const hazard = checkHazards();

  // ID stage -> EX (if no hazard)
  if (pipelineStages.id.length > 0) {
    if (!hazard) {
      const inst = pipelineStages.id.shift();
      inst.stall = false;
      pipelineStages.ex.push(inst);
    } else {
      // Mark instruction as stalled
      pipelineStages.id[0].stall = true;
    }
  }

  // IF stage -> ID (if no instruction in ID or if ID is not stalled)
  if (pipelineStages.if.length > 0 && (pipelineStages.id.length === 0 || !pipelineStages.id[0].stall)) {
    const inst = pipelineStages.if.shift();
    pipelineStages.id.push(inst);
  }

  // New instruction -> IF
  if (instructionQueue.length > 0 && pipelineStages.if.length === 0) {
    const inst = instructionQueue.shift();
    pipelineStages.if.push(inst);
  }

  updateUI();
}

function reset() {
  instructionQueue = [...instructions];
  pipelineStages = { if: [], id: [], ex: [], mem: [], wb: [] };
  completedInstructions = [];
  cycleCount = 0;

  // Reset registers to default values
  for (let i = 0; i <= 11; i++) {
    registers[`x${i}`] = DEFAULT_REG_VALUES[i];
  }

  // Reset memory
  for (let i = 0; i < 8; i++) {
    memory[i] = DEFAULT_MEM_VALUES[i];
  }

  // Form ve overlay'i gizle (eğer açıksa)
  document.getElementById("instruction-form").style.display = "none";
  document.getElementById("form-overlay").style.display = "none";

  updateUI();
}

// Form değerlerinin geçerliliğini kontrol eden yardımcı fonksiyon
function validateFormData(instType) {
  let isValid = true;
  let errorMessage = "";

  if (instType === "ADD" || instType === "SUB") {
    const dest = document.getElementById("r-dest").value;
    const src1 = document.getElementById("r-src1").value;
    const src2 = document.getElementById("r-src2").value;
    
    if (!dest || !src1 || !src2) {
      isValid = false;
      errorMessage = "Lütfen tüm yazmaçları seçin.";
    }
  } else if (instType === "LW") {
    const dest = document.getElementById("lw-dest").value;
    const offset = document.getElementById("lw-offset").value;
    const src = document.getElementById("lw-src").value;
    
    if (!dest || offset === null || !src) {
      isValid = false;
      errorMessage = "Lütfen tüm alanları doldurun.";
    }
  } else if (instType === "SW") {
    const src2 = document.getElementById("sw-src2").value;
    const offset = document.getElementById("sw-offset").value;
    const src1 = document.getElementById("sw-src1").value;
    
    if (!src1 || !src2 || offset === null) {
      isValid = false;
      errorMessage = "Lütfen tüm alanları doldurun.";
    }
  } else if (instType === "ADDI") {
    const dest = document.getElementById("addi-dest").value;
    const src = document.getElementById("addi-src").value;
    const imm = document.getElementById("addi-imm").value;
    
    if (!dest || !src || imm === "" || isNaN(parseInt(imm))) {
      isValid = false;
      errorMessage = "Lütfen tüm alanları geçerli değerlerle doldurun.";
    }
  }

  return { isValid, errorMessage };
}

// Event Listeners
document.getElementById("step-btn").addEventListener("click", step);
document.getElementById("reset-btn").addEventListener("click", reset);
document
  .getElementById("add-instruction-btn")
  .addEventListener("click", function () {
    // Formu ve overlay'i göster
    document.getElementById("instruction-form").style.display = "block";
    document.getElementById("form-overlay").style.display = "block";
  });

// İptal butonuna tıklama işlemi
document
  .getElementById("cancel-inst-btn")
  .addEventListener("click", function () {
    // Formu ve overlay'i gizle
    document.getElementById("instruction-form").style.display = "none";
    document.getElementById("form-overlay").style.display = "none";
  });

// Komut tipi seçildiğinde ilgili form alanlarını göster
document
  .getElementById("inst-type")
  .addEventListener("change", function () {
    const instType = this.value;

    // Tüm form alanlarını gizle
    document.querySelectorAll(".inst-fields").forEach((field) => {
      field.style.display = "none";
    });

    // Seçilen komut tipine göre form alanını göster
    if (instType === "ADD" || instType === "SUB") {
      document.getElementById("r-type-fields").style.display = "block";
    } else if (instType === "LW") {
      document.getElementById("lw-fields").style.display = "block";
    } else if (instType === "SW") {
      document.getElementById("sw-fields").style.display = "block";
    } else if (instType === "ADDI") {
      document.getElementById("addi-fields").style.display = "block";
    }
  });

// Ekle butonuna tıklama işlemi
document
  .getElementById("add-inst-btn")
  .addEventListener("click", function () {
    addCustomInstruction();
  });

// Komut tipi form alanlarını başlangıçta göster
document.getElementById("r-type-fields").style.display = "block";

// Özel komut ekleme fonksiyonu
function addCustomInstruction() {
  const instType = document.getElementById("inst-type").value;
  
  // Form değerlerini doğrula
  const validation = validateFormData(instType);
  if (!validation.isValid) {
    alert(validation.errorMessage);
    return;
  }
  
  let newInst;
  const id =
    instructions.length +
    instructionQueue.length +
    completedInstructions.length +
    1;

  if (instType === "ADD") {
    const destReg = document.getElementById("r-dest").value;
    const srcReg1 = document.getElementById("r-src1").value;
    const srcReg2 = document.getElementById("r-src2").value;

    newInst = {
      id,
      type: "ADD",
      text: `add ${destReg}, ${srcReg1}, ${srcReg2}`,
      src1: srcReg1,
      src2: srcReg2,
      dest: destReg,
      color: "#48bb78",
      stall: false,
      position: 0,
    };
  } else if (instType === "SUB") {
    const destReg = document.getElementById("r-dest").value;
    const srcReg1 = document.getElementById("r-src1").value;
    const srcReg2 = document.getElementById("r-src2").value;

    newInst = {
      id,
      type: "SUB",
      text: `sub ${destReg}, ${srcReg1}, ${srcReg2}`,
      src1: srcReg1,
      src2: srcReg2,
      dest: destReg,
      color: "#4299e1",
      stall: false,
      position: 0,
    };
  } else if (instType === "LW") {
    const destReg = document.getElementById("lw-dest").value;
    const offset = parseInt(document.getElementById("lw-offset").value);
    const srcReg = document.getElementById("lw-src").value;

    // Bellek indeksini offset değerine göre hesapla
    const memIndex = Math.floor(offset / 4);
    
    // Geçerli bir bellek indeksi kontrolü
    if (memIndex < 0 || memIndex >= memory.length) {
      alert(`Bellek erişim hatası: Offset ${offset} (indeks ${memIndex}) geçerli bir bellek konumu değil.`);
      return;
    }

    newInst = {
      id,
      type: "LW",
      text: `lw ${destReg}, ${offset}(${srcReg})`,
      src1: srcReg,
      dest: destReg,
      memOffset: memIndex,
      color: "#ed8936",
      stall: false,
      position: 0,
    };
  } else if (instType === "SW") {
    const srcReg2 = document.getElementById("sw-src2").value;
    const offset = parseInt(document.getElementById("sw-offset").value);
    const srcReg1 = document.getElementById("sw-src1").value;
    
    // Bellek indeksini offset değerine göre hesapla
    const memIndex = Math.floor(offset / 4);
    
    // Geçerli bir bellek indeksi kontrolü
    if (memIndex < 0 || memIndex >= memory.length) {
      alert(`Bellek erişim hatası: Offset ${offset} (indeks ${memIndex}) geçerli bir bellek konumu değil.`);
      return;
    }

    newInst = {
      id,
      type: "SW",
      text: `sw ${srcReg2}, ${offset}(${srcReg1})`,
      src1: srcReg1,
      src2: srcReg2,
      memOffset: memIndex,
      color: "#805ad5",
      stall: false,
      position: 0,
    };
  } else if (instType === "ADDI") {
    const destReg = document.getElementById("addi-dest").value;
    const srcReg = document.getElementById("addi-src").value;
    const imm = parseInt(document.getElementById("addi-imm").value);

    newInst = {
      id,
      type: "ADDI",
      text: `addi ${destReg}, ${srcReg}, ${imm}`,
      src1: srcReg,
      imm: imm,
      dest: destReg,
      color: "#667eea",
      stall: false,
      position: 0,
    };
  }

  instructionQueue.push(newInst);
  
  // Formu ve overlay'i gizle
  document.getElementById("instruction-form").style.display = "none";
  document.getElementById("form-overlay").style.display = "none";
  
  updateUI();
}

// Overlay'e tıklama işlemi - formu kapat
document.getElementById("form-overlay").addEventListener("click", function () {
  document.getElementById("instruction-form").style.display = "none";
  document.getElementById("form-overlay").style.display = "none";
});

// Initialize UI
updateUI();
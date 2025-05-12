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
    offset: 0,
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
    offset: 4,
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

// Calculate memory index from byte offset
function calculateMemoryIndex(offset) {
  return Math.floor(offset / 4);
}

// Improved forwarding value retrieval to prevent infinite recursion
function getForwardedValue(registerName, depth = 0, maxDepth = 3) {
  // Always return 0 for x0 register
  if (registerName === "x0") return 0;

  // Prevent infinite recursion by limiting depth
  if (depth >= maxDepth) {
    return registers[registerName];
  }

  // Check EX stage (highest priority)
  for (const inst of pipelineStages.ex) {
    if (inst.dest === registerName) {
      // LW instructions don't have a value available in EX
      if (inst.type === "LW") continue;

      // Calculate result based on instruction type
      if (inst.type === "ADD") {
        return getForwardedValue(inst.src1, depth + 1, maxDepth) +
          getForwardedValue(inst.src2, depth + 1, maxDepth);
      } else if (inst.type === "SUB") {
        return getForwardedValue(inst.src1, depth + 1, maxDepth) -
          getForwardedValue(inst.src2, depth + 1, maxDepth);
      } else if (inst.type === "ADDI") {
        return getForwardedValue(inst.src1, depth + 1, maxDepth) + inst.imm;
      }
    }
  }

  // Check MEM stage
  for (const inst of pipelineStages.mem) {
    if (inst.dest === registerName) {
      // Use pre-computed result if available
      if (inst.result !== undefined) {
        return inst.result;
      }
      // Handle LW instructions - we can access memory at this stage
      else if (inst.type === "LW") {
        const memIndex = inst.memOffset;
        if (memIndex >= 0 && memIndex < memory.length) {
          return memory[memIndex];
        }
        console.error(`Bellek erişim hatası: Index ${memIndex} geçerli bir bellek konumu değil.`);
        return 0; // Default value for invalid memory access
      }
      // Calculate result for other instructions
      else if (inst.type === "ADD") {
        return getForwardedValue(inst.src1, depth + 1, maxDepth) +
          getForwardedValue(inst.src2, depth + 1, maxDepth);
      } else if (inst.type === "SUB") {
        return getForwardedValue(inst.src1, depth + 1, maxDepth) -
          getForwardedValue(inst.src2, depth + 1, maxDepth);
      } else if (inst.type === "ADDI") {
        return getForwardedValue(inst.src1, depth + 1, maxDepth) + inst.imm;
      }
    }
  }

  // Check WB stage
  for (const inst of pipelineStages.wb) {
    if (inst.dest === registerName) {
      // Use pre-computed result if available
      if (inst.result !== undefined) {
        return inst.result;
      }
      // Calculate result for other instructions
      else if (inst.type === "ADD") {
        return getForwardedValue(inst.src1, depth + 1, maxDepth) +
          getForwardedValue(inst.src2, depth + 1, maxDepth);
      } else if (inst.type === "SUB") {
        return getForwardedValue(inst.src1, depth + 1, maxDepth) -
          getForwardedValue(inst.src2, depth + 1, maxDepth);
      } else if (inst.type === "LW") {
        const memIndex = inst.memOffset;
        if (memIndex >= 0 && memIndex < memory.length) {
          return memory[memIndex];
        }
        console.error(`Bellek erişim hatası: Index ${memIndex} geçerli bir bellek konumu değil.`);
        return 0; // Default value for invalid memory access
      } else if (inst.type === "ADDI") {
        return getForwardedValue(inst.src1, depth + 1, maxDepth) + inst.imm;
      }
    }
  }

  // If no forwarding source is found, return the current register value
  return registers[registerName];
}

// Improved hazard detection to handle all data hazards
function checkHazards() {
  if (pipelineStages.id.length === 0) return false;

  const idInst = pipelineStages.id[0];
  const src1 = idInst.src1;
  const src2 = idInst.type === "SW" ? idInst.src2 : idInst.src2 || null;

  // Check for load-use hazards specifically
  // A load-use hazard occurs when a LW instruction is in EX stage
  // and the next instruction in ID stage needs the loaded value
  for (const inst of pipelineStages.ex) {
    if (inst.type === "LW") {
      // If LW's destination matches any source register of ID instruction
      if (inst.dest === src1 || inst.dest === src2) {
        return true; // Load-use hazard detected, stall required
      }
    }
  }

  // No hazards that can't be handled by forwarding
  return false;
}

function executeInstruction(inst) {
  // Helper function to perform the actual computation based on instruction type
  if (inst.type === "ADD") {
    const src1Value = getForwardedValue(inst.src1);
    const src2Value = getForwardedValue(inst.src2);
    return Math.floor(src1Value + src2Value);
  } else if (inst.type === "SUB") {
    const src1Value = getForwardedValue(inst.src1);
    const src2Value = getForwardedValue(inst.src2);
    return Math.floor(src1Value - src2Value);
  } else if (inst.type === "ADDI") {
    const src1Value = getForwardedValue(inst.src1);
    return Math.floor(src1Value + inst.imm);
  } else if (inst.type === "LW") {
    if (inst.memOffset >= 0 && inst.memOffset < memory.length) {
      return memory[inst.memOffset];
    }
    console.error(`Bellek erişim hatası: Index ${inst.memOffset} geçerli bir bellek konumu değil.`);
    return 0;
  }
  return 0; // Default return value
}

function step() {
  cycleCount++;

  // WB stage -> Completed
  if (pipelineStages.wb.length > 0) {
    const inst = pipelineStages.wb.shift();
    completedInstructions.push(inst);

    // Update registers
    if (inst.dest && inst.dest !== "x0") { // x0 register should always be 0
      if (inst.result !== undefined) {
        registers[inst.dest] = Math.floor(inst.result);
      } else {
        registers[inst.dest] = executeInstruction(inst);
      }
    }
  }

  // MEM stage -> WB
  if (pipelineStages.mem.length > 0) {
    const inst = pipelineStages.mem.shift();

    // SW komutu için bellek yazma işlemi MEM aşamasında gerçekleşir
    if (inst.type === "SW") {
      // Bellek sınırlarını kontrol et
      if (inst.memOffset >= 0 && inst.memOffset < memory.length) {
        // Forwarding mekanizması ile src2 değerini al
        const valueToStore = getForwardedValue(inst.src2);
        memory[inst.memOffset] = Math.floor(valueToStore);
      } else {
        console.error(`Bellek yazma hatası: İndeks ${inst.memOffset} geçerli bir bellek konumu değil.`);
      }
    }
    // For LW instructions, compute the result now
    else if (inst.type === "LW") {
      if (inst.memOffset >= 0 && inst.memOffset < memory.length) {
        inst.result = memory[inst.memOffset];
      } else {
        console.error(`Bellek okuma hatası: İndeks ${inst.memOffset} geçerli bir bellek konumu değil.`);
        inst.result = 0;
      }
    }

    pipelineStages.wb.push(inst);
  }

  // EX stage -> MEM
  if (pipelineStages.ex.length > 0) {
    const inst = pipelineStages.ex.shift();

    // Calculate results in EX stage using forwarded values
    if (inst.type === "ADD" || inst.type === "SUB" || inst.type === "ADDI") {
      inst.result = executeInstruction(inst);
    } else if (inst.type === "LW" || inst.type === "SW") {
      // İletilen baz yazmaç değerini kullanarak etkin adresi hesapla
      const baseValue = getForwardedValue(inst.src1);
      inst.effectiveAddress = baseValue + inst.offset;
      // Bellek indeksini güncelle
      inst.memOffset = calculateMemoryIndex(inst.effectiveAddress);
    }

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

  // IF stage -> ID (if ID has no instruction or if ID is not stalled)
  if (pipelineStages.if.length > 0 && (pipelineStages.id.length === 0 || !pipelineStages.id[0].stall)) {
    const inst = pipelineStages.if.shift();
    pipelineStages.id.push(inst);
  }

  // New instruction -> IF
  if (instructionQueue.length > 0 && pipelineStages.if.length === 0) {
    const inst = instructionQueue.shift();
    pipelineStages.if.push({ ...inst }); // Clone the instruction to avoid reference issues
  }

  updateUI();
}

function updateUI() {
  // Update pipeline visualization
  for (const stage in pipelineStages) {
    const stageEl = document.getElementById(`${stage}-stage`);
    stageEl.innerHTML = "";

    pipelineStages[stage].forEach((inst) => {
      const instEl = document.createElement("div");
      instEl.className = "instruction";
      instEl.style.backgroundColor = inst.stall ? "#f56565" : inst.color;
      instEl.style.width = "100%";

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

  // Update registers - only update registers that have changed
  for (const reg in registers) {
    const regEl = document.getElementById(reg);
    if (regEl && regEl.textContent != registers[reg]) {
      regEl.textContent = registers[reg];
    }
  }

  // Update memory - only update memory locations that have changed
  memory.forEach((val, idx) => {
    const memEl = document.getElementById(`mem-${idx}`);
    if (memEl && memEl.textContent != val) {
      memEl.textContent = val;
    }
  });

  // Update cycle count
  document.getElementById("cycle-count").textContent = cycleCount;

  // Update completed instructions (only append new ones)
  const completedList = document.getElementById("completed-list");
  if (completedInstructions.length > completedList.children.length) {
    const newInst = completedInstructions[completedInstructions.length - 1];
    const instEl = document.createElement("div");
    instEl.className = "completed-instruction";
    instEl.textContent = newInst.text;
    completedList.appendChild(instEl);
  }

  // Update hazard display
  updateHazardDisplay();
}

function updateHazardDisplay() {
  const hazardDisplay = document.getElementById("hazard-display");
  hazardDisplay.innerHTML = "";

  const hazardInfo = document.createElement("div");
  hazardInfo.className = "hazard-info";
  hazardDisplay.appendChild(hazardInfo);

  let hasHazard = false;
  let hasForwarding = false;

  // Check for stalls in any stage
  for (const stage in pipelineStages) {
    pipelineStages[stage].forEach((inst) => {
      if (inst.stall) {
        hasHazard = true;
      }
    });
  }

  // Check if forwarding is being used
  // If there's an instruction in ID stage and its sources are targeted by instructions in EX, MEM or WB stages
  if (pipelineStages.id.length > 0) {
    const idInst = pipelineStages.id[0];
    const src1 = idInst.src1;
    const src2 = (idInst.type === "SW") ? idInst.src2 : (idInst.src2 || null);

    const stagesToCheck = [...pipelineStages.ex, ...pipelineStages.mem, ...pipelineStages.wb];
    hasForwarding = stagesToCheck.some(inst => {
      if (!inst.dest || inst.dest === "x0") return false;
      return (inst.dest === src1 || inst.dest === src2) &&
        // Exclude load-use hazard situations (where forwarding doesn't work)
        !(inst.type === "LW" && pipelineStages.ex.includes(inst));
    });
  }

  // Display appropriate message based on hazard/forwarding status
  if (hasHazard) {
    hazardInfo.textContent = "Data Hazard Tespit Edildi! Stall uygulanıyor.";
    hazardInfo.style.color = "#f56565";
  } else if (hasForwarding) {
    hazardInfo.textContent = "Forwarding aktif: Veri iletimi gerçekleştiriliyor.";
  } else {
    hazardInfo.textContent = "Herhangi bir veri bağımlılığı yok.";
    hazardInfo.style.backgroundColor = "rgb(49, 167, 45)";
    hazardInfo.style.animation = "none";
  }

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

  // Hide form and overlay (if open)
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

    if (!dest || offset === null || offset === "" || !src) {
      isValid = false;
      errorMessage = "Lütfen tüm alanları doldurun.";
    } else if (isNaN(parseInt(offset))) {
      isValid = false;
      errorMessage = "Lütfen geçerli bir sayı girin.";
    }
  } else if (instType === "SW") {
    const src2 = document.getElementById("sw-src2").value;
    const offset = document.getElementById("sw-offset").value;
    const src1 = document.getElementById("sw-src1").value;

    if (!src1 || !src2 || offset === null || offset === "") {
      isValid = false;
      errorMessage = "Lütfen tüm alanları doldurun.";
    } else if (isNaN(parseInt(offset))) {
      isValid = false;
      errorMessage = "Lütfen geçerli bir sayı girin.";
    }
  } else if (instType === "ADDI") {
    const dest = document.getElementById("addi-dest").value;
    const src = document.getElementById("addi-src").value;
    const imm = document.getElementById("addi-imm").value;

    if (!dest || !src || imm === "") {
      isValid = false;
      errorMessage = "Lütfen tüm alanları doldurun.";
    } else if (isNaN(parseInt(imm))) {
      isValid = false;
      errorMessage = "Lütfen geçerli bir sayı girin.";
    }
  }

  return { isValid, errorMessage };
}

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
  const id = instructions.length + instructionQueue.length + completedInstructions.length + 1;

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
    const memIndex = calculateMemoryIndex(offset);

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
      offset: offset,
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
    const memIndex = calculateMemoryIndex(offset);

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
      offset: offset,
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

// Event Listeners
document.getElementById("step-btn").addEventListener("click", step);
document.getElementById("reset-btn").addEventListener("click", reset);
document.getElementById("add-instruction-btn").addEventListener("click", function () {
  // Formu ve overlay'i göster
  document.getElementById("instruction-form").style.display = "block";
  document.getElementById("form-overlay").style.display = "block";
});

// İptal butonuna tıklama işlemi
document.getElementById("cancel-inst-btn").addEventListener("click", function () {
  // Formu ve overlay'i gizle
  document.getElementById("instruction-form").style.display = "none";
  document.getElementById("form-overlay").style.display = "none";
});

// Komut tipi seçildiğinde ilgili form alanlarını göster
document.getElementById("inst-type").addEventListener("change", function () {
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
document.getElementById("add-inst-btn").addEventListener("click", function () {
  addCustomInstruction();
});

// Overlay'e tıklama işlemi - formu kapat
document.getElementById("form-overlay").addEventListener("click", function () {
  document.getElementById("instruction-form").style.display = "none";
  document.getElementById("form-overlay").style.display = "none";
});

// Komut tipi form alanlarını başlangıçta göster
document.getElementById("r-type-fields").style.display = "block";

// Initialize UI
updateUI();
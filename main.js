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
  x0: 0, // sıfır (sabit 0)
  x1: 5, // ra (dönüş adresi)
  x2: 200, // sp (yığın işaretçisi)
  x3: 15, // gp (global işaretçi)
  x4: 20, // tp (iş parçacığı işaretçisi)
  x5: 25, // t0 (geçici)
  x6: 30, // t1 (geçici)
  x7: 35, // t2 (geçici)
  x8: 40, // s0/fp (kaydedilen/çerçeve işaretçisi)
  x9: 45, // s1 (kaydedilen yazmacı)
  x10: 50, // a0 (argüman/dönüş)
  x11: 55, // a1 (argüman/dönüş)
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

// Sekme işleme
const tabButtons = document.querySelectorAll(".tab-button");
tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    // Tüm düğmelerden ve panellerden aktif sınıfını kaldır
    tabButtons.forEach((btn) => btn.classList.remove("active"));
    document
      .querySelectorAll(".tab-pane")
      .forEach((pane) => pane.classList.remove("active"));

    // Tıklanan düğmeye ve ilgili panele aktif sınıfını ekle
    button.classList.add("active");
    const tabId = button.getAttribute("data-tab");
    document.getElementById(`${tabId}-tab`).classList.add("active");
  });
});

// Bayt ofsetinden bellek indeksini hesapla
function calculateMemoryIndex(offset) {
  return Math.floor(offset / 4);
}

// Sonsuz özyinelemeyi önlemek için geliştirilmiş iletim değeri alma
function getForwardedValue(registerName, depth = 0, maxDepth = 3) {
  // x0 yazmaç için her zaman 0 döndür
  if (registerName === "x0") return 0;

  // Derinlik sınırını aşarak sonsuz özyinelemeyi önle
  if (depth >= maxDepth) {
    return registers[registerName];
  }

  // EX aşamasını kontrol et (en yüksek öncelik)
  for (const inst of pipelineStages.ex) {
    if (inst.dest === registerName) {
      // LW komutlarının EX aşamasında değeri yoktur
      if (inst.type === "LW") continue;

      // Komut tipine göre sonucu hesapla
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

  // MEM aşamasını kontrol et
  for (const inst of pipelineStages.mem) {
    if (inst.dest === registerName) {
      // Önceden hesaplanmış sonucu kullan (mevcutsa)
      if (inst.result !== undefined) {
        return inst.result;
      }
      // LW komutlarını ele al - bu aşamada belleğe erişebiliriz
      else if (inst.type === "LW") {
        const memIndex = inst.memOffset;
        if (memIndex >= 0 && memIndex < memory.length) {
          return memory[memIndex];
        }
        console.error(`Bellek erişim hatası: Index ${memIndex} geçerli bir bellek konumu değil.`);
        return 0; // Geçersiz bellek erişimi için varsayılan değer
      }
      // Diğer komutlar için sonucu hesapla
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

  // WB aşamasını kontrol et
  for (const inst of pipelineStages.wb) {
    if (inst.dest === registerName) {
      // Önceden hesaplanmış sonucu kullan (mevcutsa)
      if (inst.result !== undefined) {
        return inst.result;
      }
      // Diğer komutlar için sonucu hesapla
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
        return 0; // Geçersiz bellek erişimi için varsayılan değer
      } else if (inst.type === "ADDI") {
        return getForwardedValue(inst.src1, depth + 1, maxDepth) + inst.imm;
      }
    }
  }

  // İletim kaynağı bulunamadıysa, mevcut yazmaç değerini döndür
  return registers[registerName];
}

// Tüm veri bağımlılıklarını ele almak için geliştirilmiş bağımlılık tespiti
function checkHazards() {
  if (pipelineStages.id.length === 0) return false;

  const idInst = pipelineStages.id[0];
  const src1 = idInst.src1;
  const src2 = idInst.type === "SW" ? idInst.src2 : idInst.src2 || null;

  // Özellikle yükleme-kullanma bağımlılıklarını kontrol et
  // Yükleme-kullanma bağımlılığı, bir LW komutu EX aşamasındayken
  // ve ID aşamasındaki bir sonraki komut yüklenen değeri kullanıyorsa oluşur
  for (const inst of pipelineStages.ex) {
    if (inst.type === "LW") {
      // Eğer LW'nin hedefi, ID komutunun herhangi bir kaynak yazmacı ile eşleşiyorsa
      if (inst.dest === src1 || inst.dest === src2) {
        return true; // Yükleme-kullanma bağımlılığı tespit edildi, duraklatma gerekli
      }
    }
  }

  // İletim mekanizması ile ele alınamayan bağımlılık yok
  return false;
}

function executeInstruction(inst) {
  // Komut tipine göre gerçek hesaplamaları gerçekleştiren yardımcı fonksiyon
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
  return 0; // Varsayılan dönüş değeri
}

function step() {
  cycleCount++;

  // WB aşaması -> Tamamlanan
  if (pipelineStages.wb.length > 0) {
    const inst = pipelineStages.wb.shift();
    completedInstructions.push(inst);

    // Yazmaçları güncelle
    if (inst.dest && inst.dest !== "x0") { // x0 yazmacı her zaman 0 olmalıdır
      if (inst.result !== undefined) {
        registers[inst.dest] = Math.floor(inst.result);
      } else {
        registers[inst.dest] = executeInstruction(inst);
      }
    }
  }

  // MEM aşaması -> WB
  if (pipelineStages.mem.length > 0) {
    const inst = pipelineStages.mem.shift();

    // SW komutu için bellek yazma işlemi MEM aşamasında gerçekleşir
    if (inst.type === "SW") {
      // Bellek sınırlarını kontrol et
      if (inst.memOffset >= 0 && inst.memOffset < memory.length) {
        // İletim mekanizması ile src2 değerini al
        const valueToStore = getForwardedValue(inst.src2);
        memory[inst.memOffset] = Math.floor(valueToStore);
      } else {
        console.error(`Bellek yazma hatası: İndeks ${inst.memOffset} geçerli bir bellek konumu değil.`);
      }
    }
    // LW komutları için sonucu şimdi hesapla
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

  // EX aşaması -> MEM
  if (pipelineStages.ex.length > 0) {
    const inst = pipelineStages.ex.shift();

    // İletilmiş değerleri kullanarak EX aşamasında sonuçları hesapla
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

  // Bağımlılıkları kontrol et
  const hazard = checkHazards();

  // ID aşaması -> EX (bağımlılık yoksa)
  if (pipelineStages.id.length > 0) {
    if (!hazard) {
      const inst = pipelineStages.id.shift();
      inst.stall = false;
      pipelineStages.ex.push(inst);
    } else {
      // Komutu duraklatılmış olarak işaretle
      pipelineStages.id[0].stall = true;
    }
  }

  // IF aşaması -> ID (ID'de komut yoksa veya ID duraklatılmamışsa)
  if (pipelineStages.if.length > 0 && (pipelineStages.id.length === 0 || !pipelineStages.id[0].stall)) {
    const inst = pipelineStages.if.shift();
    pipelineStages.id.push(inst);
  }

  // Yeni komut -> IF
  if (instructionQueue.length > 0 && pipelineStages.if.length === 0) {
    const inst = instructionQueue.shift();
    pipelineStages.if.push({ ...inst }); // Referans sorunlarını önlemek için komutu klonla
  }

  updateUI();
}

function updateUI() {
  // Pipeline görselleştirmesini güncelle
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

  // Yazmaçları güncelle - sadece değişen yazmaçları güncelle
  for (const reg in registers) {
    const regEl = document.getElementById(reg);
    if (regEl && regEl.textContent != registers[reg]) {
      regEl.textContent = registers[reg];
    }
  }

  // Belleği güncelle - sadece değişen bellek konumlarını güncelle
  memory.forEach((val, idx) => {
    const memEl = document.getElementById(`mem-${idx}`);
    if (memEl && memEl.textContent != val) {
      memEl.textContent = val;
    }
  });

  // Çevrim sayısını güncelle
  document.getElementById("cycle-count").textContent = cycleCount;

  // Tamamlanan komutları güncelle (sadece yenilerini ekle)
  const completedList = document.getElementById("completed-list");
  if (completedInstructions.length > completedList.children.length) {
    const newInst = completedInstructions[completedInstructions.length - 1];
    const instEl = document.createElement("div");
    instEl.className = "completed-instruction";
    instEl.textContent = newInst.text;
    completedList.appendChild(instEl);
  }

  // Bağımlılık göstergesini güncelle
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

  // Herhangi bir aşamada duraklatma olup olmadığını kontrol et
  for (const stage in pipelineStages) {
    pipelineStages[stage].forEach((inst) => {
      if (inst.stall) {
        hasHazard = true;
      }
    });
  }

  // İletim mekanizmasının kullanılıp kullanılmadığını kontrol et
  // ID aşamasında bir talimat varsa ve kaynakları EX, MEM veya WB aşamalarındaki komutlar tarafından hedefleniyorsa
  if (pipelineStages.id.length > 0) {
    const idInst = pipelineStages.id[0];
    const src1 = idInst.src1;
    const src2 = (idInst.type === "SW") ? idInst.src2 : (idInst.src2 || null);

    const stagesToCheck = [...pipelineStages.ex, ...pipelineStages.mem, ...pipelineStages.wb];
    hasForwarding = stagesToCheck.some(inst => {
      if (!inst.dest || inst.dest === "x0") return false;
      return (inst.dest === src1 || inst.dest === src2) &&
        // Yükleme-kullanma bağımlılık durumlarını hariç tut (iletim mekanizması çalışmaz)
        !(inst.type === "LW" && pipelineStages.ex.includes(inst));
    });
  }

  // Bağımlılık/iletim durumuna göre uygun mesajı göster
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

  // Yazmaçları varsayılan değerlere sıfırla
  for (let i = 0; i <= 11; i++) {
    registers[`x${i}`] = DEFAULT_REG_VALUES[i];
  }

  // Belleği sıfırla
  for (let i = 0; i < 8; i++) {
    memory[i] = DEFAULT_MEM_VALUES[i];
  }

  // Form ve overlay'i gizle (açıksa)
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

// Olay Dinleyicileri
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
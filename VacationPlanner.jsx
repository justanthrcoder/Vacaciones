import React, { useEffect, useMemo, useState, useRef } from "react";
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';

// Helper date utilities (YYYY-MM-DD)
const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return formatYMD(d);
};

function formatYMD(d) {
  if (typeof d === "string") return d;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseYMD(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(a, b) {
  const da = parseYMD(a);
  const db = parseYMD(b);
  return Math.round((db - da) / (24 * 3600 * 1000));
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return !(parseYMD(aEnd) < parseYMD(bStart) || parseYMD(bEnd) < parseYMD(aStart));
}

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function randomPastel() {
  const h = Math.floor(Math.random() * 360);
  const c1 = `hsl(${h} 60% 80%)`;
  const c2 = `hsl(${(h + 30) % 360} 60% 70%)`;
  return `linear-gradient(90deg, ${c1}, ${c2})`;
}

export default function App() {
  const [employees, setEmployees] = useState([]);
  const [vacations, setVacations] = useState([]);
  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [selectStart, setSelectStart] = useState(null);
  const [selectEnd, setSelectEnd] = useState(null);
  const [assignEmployeeId, setAssignEmployeeId] = useState(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const assignRef = useRef(null);
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [message, setMessage] = useState(null);
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // Firestore setup and authentication
  useEffect(() => {
    try {
      // Use the global variables provided by the Canvas environment directly
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
      const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};

      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const firebaseAuth = getAuth(app);
      setDb(firestore);
      setAuth(firebaseAuth);

      const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
        if (user) {
          setUserId(user.uid);
          setIsAuthReady(true);
        } else {
          // If no user, sign in anonymously for public access
          try {
            if (typeof __initial_auth_token !== 'undefined') {
              await signInWithCustomToken(firebaseAuth, __initial_auth_token);
            } else {
              await signInAnonymously(firebaseAuth);
            }
          } catch (error) {
            console.error("Error signing in:", error);
            setUserId(crypto.randomUUID());
            setIsAuthReady(true);
          }
        }
      });

      return () => unsubscribe();
    } catch (e) {
      console.error("Firebase initialization failed:", e);
    }
  }, []);

  // Listen for real-time updates from Firestore for employees
  useEffect(() => {
    if (!db || !isAuthReady) return;
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const employeesPath = `/artifacts/${appId}/public/data/employees`;
    const q = query(collection(db, employeesPath));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const empData = [];
      snapshot.forEach((doc) => {
        empData.push({ id: doc.id, ...doc.data() });
      });
      setEmployees(empData);
    }, (error) => {
      console.error("Error fetching employees:", error);
    });

    return () => unsubscribe();
  }, [db, isAuthReady]);

  // Listen for real-time updates from Firestore for vacations
  useEffect(() => {
    if (!db || !isAuthReady) return;
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const vacationsPath = `/artifacts/${appId}/public/data/vacations`;
    const q = query(collection(db, vacationsPath));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const vacData = [];
      snapshot.forEach((doc) => {
        vacData.push({ id: doc.id, ...doc.data() });
      });
      setVacations(vacData);
    }, (error) => {
      console.error("Error fetching vacations:", error);
    });

    return () => unsubscribe();
  }, [db, isAuthReady]);

  // Handle clicks outside the dropdown
  useEffect(() => {
    function onDoc(e) {
      if (assignRef.current && !assignRef.current.contains(e.target)) {
        setAssignOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const monthDays = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const firstWeekday = firstOfMonth.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const weeks = [];
    let dayCounter = 1;
    let week = new Array(7).fill(null);
    for (let i = 0; i < 7; i++) {
      if (i < firstWeekday) week[i] = null;
      else {
        week[i] = formatYMD(new Date(viewYear, viewMonth, dayCounter));
        dayCounter++;
      }
    }
    weeks.push(week);
    while (dayCounter <= daysInMonth) {
      const w = new Array(7).fill(null);
      for (let i = 0; i < 7 && dayCounter <= daysInMonth; i++) {
        w[i] = formatYMD(new Date(viewYear, viewMonth, dayCounter));
        dayCounter++;
      }
      weeks.push(w);
    }
    return weeks;
  }, [viewYear, viewMonth]);

  function vacationsCovering(date) {
    if (!date) return [];
    return vacations.filter((v) => parseYMD(v.start) <= parseYMD(date) && parseYMD(date) <= parseYMD(v.end));
  }

  function onDayClick(dateStr) {
    if (!dateStr) return;
    if (!selectStart) {
      setSelectStart(dateStr);
      setSelectEnd(null);
      setMessage(null);
    } else if (selectStart && !selectEnd) {
      if (parseYMD(dateStr) < parseYMD(selectStart)) {
        setSelectEnd(selectStart);
        setSelectStart(dateStr);
      } else {
        setSelectEnd(dateStr);
      }
    } else {
      setSelectStart(dateStr);
      setSelectEnd(null);
    }
  }

  function clearSelection() {
    setSelectStart(null);
    setSelectEnd(null);
    setAssignEmployeeId(null);
    setMessage(null);
  }

  async function tryAssign() {
    if (!selectStart || !selectEnd) return setMessage("Selecciona un rango válido (start y end).");
    if (!assignEmployeeId) return setMessage("Selecciona un empleado al que asignar esas vacaciones.");
    if (!db) return setMessage("Error: No se puede conectar a la base de datos.");

    const newStart = selectStart;
    const newEnd = selectEnd;
    
    try {
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
      const vacationsPath = `/artifacts/${appId}/public/data/vacations`;

      // Simplemente agrega una nueva entrada de vacaciones.
      // La lógica de prevención de conflictos ha sido eliminada.
      const newVac = { employeeId: assignEmployeeId, start: newStart, end: newEnd };
      await addDoc(collection(db, vacationsPath), newVac);

      clearSelection();
      setMessage("Vacaciones asignadas correctamente.");
      setTimeout(() => setMessage(null), 2500);

    } catch (e) {
      console.error("Error assigning vacation:", e);
      setMessage("Error al asignar vacaciones. Intenta de nuevo.");
    }
  }

  async function removeVacation(vacId) {
    if (!db) return;
    try {
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
      const vacationsPath = `/artifacts/${appId}/public/data/vacations`;
      await deleteDoc(doc(db, vacationsPath, vacId));
    } catch (e) {
      console.error("Error removing vacation:", e);
    }
  }

  async function addEmployee() {
    if (!db) return;
    const name = newEmployeeName.trim();
    if (!name) return;
    try {
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
      const employeesPath = `/artifacts/${appId}/public/data/employees`;
      const newEmp = { name, color: randomPastel() };
      await addDoc(collection(db, employeesPath), newEmp);
      setNewEmployeeName("");
    } catch (e) {
      console.error("Error adding employee:", e);
    }
  }

  async function removeEmployee(empId) {
    if (!db) return;
    try {
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
      const employeesPath = `/artifacts/${appId}/public/data/employees`;
      const vacationsPath = `/artifacts/${appId}/public/data/vacations`;

      // Delete employee document
      await deleteDoc(doc(db, employeesPath, empId));

      // Delete all vacations for this employee (important for data integrity)
      const q = query(collection(db, vacationsPath), where("employeeId", "==", empId));
      const querySnapshot = await getDocs(q);
      querySnapshot.forEach(async (d) => {
        await deleteDoc(d.ref);
      });
    } catch (e) {
      console.error("Error removing employee and vacations:", e);
    }
  }

  function cellClasses(dateStr) {
    const classes = ["p-1 rounded-lg text-white relative overflow-hidden h-28 cursor-pointer hover:bg-white/5 transition-colors duration-150 ease-in-out"];
    if (!dateStr) {
        return "pointer-events-none"; // Disables hover and click for null cells
    }
    if (dateStr === today()) classes.push("border border-dashed border-sky-400/50");
    if (selectStart && (!selectEnd && dateStr === selectStart)) classes.push("ring-2 ring-blue-300 ring-offset-2 ring-offset-slate-900");
    if (selectStart && selectEnd) {
      if (parseYMD(selectStart) <= parseYMD(dateStr) && parseYMD(dateStr) <= parseYMD(selectEnd)) classes.push("bg-white/5");
      if (dateStr === selectStart) classes.push("ring-2 ring-blue-300 ring-offset-2 ring-offset-slate-900");
      if (dateStr === selectEnd) classes.push("ring-2 ring-green-300 ring-offset-2 ring-offset-slate-900");
    }
    return classes.join(" ");
  }

  function employeeById(id) {
    return employees.find((e) => e.id === id) || { name: "Desconocido", color: "gray" };
  }

  return (
    <div className="bg-slate-900 min-h-screen flex items-center justify-center p-8 font-sans antialiased text-gray-100">
        <div className="bg-slate-800/60 backdrop-blur-md rounded-2xl p-6 shadow-2xl flex flex-col md:flex-row gap-6 w-full max-w-6xl border border-slate-700">

            {/* Sidebar */}
            <div className="w-full md:w-1/3 bg-slate-800/50 rounded-xl p-4 flex flex-col gap-4 border border-slate-700">
                <h2 className="text-xl font-bold text-gray-50">Empleados</h2>
                <div className="flex flex-col gap-2">
                    <label htmlFor="newEmp" className="text-sm font-medium text-gray-300">Agregar persona</label>
                    <div className="flex gap-2">
                        <input
                            id="newEmp"
                            type="text"
                            value={newEmployeeName}
                            onChange={(e) => setNewEmployeeName(e.target.value)}
                            placeholder="Nombre..."
                            className="flex-1 p-2 rounded-lg bg-slate-700 border border-slate-600 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-inner"
                        />
                        <button onClick={addEmployee} className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 transition-colors text-white font-bold text-lg shadow-md hover:shadow-lg transition-transform hover:scale-105">+</button>
                    </div>
                </div>

                <div className="flex flex-col gap-2 mt-2">
                    {employees.map((e) => (
                        <div key={e.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-700/50">
                            <div className="flex items-center gap-3">
                                <div className="w-4 h-4 rounded-full" style={{ background: e.color }} />
                                <div className="text-gray-200">{e.name}</div>
                            </div>
                            {/* Se mejora el botón de eliminación para que sea más fácil de clickear y tenga un mejor estilo */}
                            <button onClick={() => removeEmployee(e.id)} className="w-6 h-6 flex items-center justify-center rounded-full bg-red-600/50 hover:bg-red-600 text-white transition-colors">
                              -
                            </button>
                        </div>
                    ))}
                    {employees.length === 0 && <div className="text-gray-400 text-sm">No hay empleados aún</div>}
                </div>
            </div>

            {/* Main Calendar View */}
            <div className="w-full md:w-2/3 p-4 flex flex-col gap-4">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-2xl font-bold text-gray-50">Calendario de Vacaciones</h1>
                </div>

                <div className="text-sm text-gray-400">
                    Selecciona un rango de fechas haciendo clic en el primer y último día. Luego, elige un empleado y haz clic en "Asignar".
                </div>

                {message && (
                    <div className="p-3 rounded-lg bg-sky-600/20 border border-sky-400 text-sky-200 font-medium animate-pulse shadow-md">
                        {message}
                    </div>
                )}

                <div className="flex items-center gap-4 mb-4">
                    <div className="flex gap-2">
                        <button onClick={() => { setViewMonth(viewMonth - 1); if (viewMonth - 1 < 0) { setViewMonth(11); setViewYear(viewYear - 1); } }} className="p-2 rounded-full bg-slate-700/50 hover:bg-slate-700 transition-colors text-white text-xl shadow-md hover:shadow-lg transition-transform hover:scale-105">&lt;</button>
                        <button onClick={() => { setViewMonth(new Date().getMonth()); setViewYear(new Date().getFullYear()); }} className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 transition-colors text-sm text-white font-medium shadow-md hover:shadow-lg transition-transform hover:scale-105">Hoy</button>
                        <button onClick={() => { setViewMonth(viewMonth + 1); if (viewMonth + 1 > 11) { setViewMonth(0); setViewYear(viewYear + 1); } }} className="p-2 rounded-full bg-slate-700/50 hover:bg-slate-700 transition-colors text-white text-xl shadow-md hover:shadow-lg transition-transform hover:scale-105">&gt;</button>
                    </div>
                    
                    <div className="flex-1 text-right text-gray-400 text-sm">
                        {selectStart && selectEnd ? (
                            <span>Rango: <span className="text-white font-bold">{selectStart}</span> → <span className="text-white font-bold">{selectEnd}</span></span>
                        ) : selectStart ? (
                            <span>Inicio: <span className="text-white font-bold">{selectStart}</span></span>
                        ) : null}
                    </div>
                </div>

                <div className="grid grid-cols-7 gap-2 text-center text-sm font-medium text-gray-400 mb-2">
                    {['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map((w) => <div key={w}>{w}</div>)}
                </div>

                <div className="grid grid-cols-7 gap-2">
                    {monthDays.flat().map((d, idx) => (
                        <div key={idx} className={cellClasses(d)} onClick={() => onDayClick(d)}>
                            {d ? (
                                <>
                                    <div className="absolute top-2 left-2 text-sm font-bold text-gray-300">
                                        {parseYMD(d).getDate()}
                                    </div>
                                    <div className="absolute bottom-1 left-1 right-1 flex flex-col items-center">
                                        {vacationsCovering(d).map((v) => (
                                            <div
                                                key={v.id}
                                                className="w-full rounded-md shadow-lg p-1 text-xs font-semibold text-white truncate my-0.5 relative"
                                                style={{ background: employeeById(v.employeeId).color }}
                                            >
                                                {employeeById(v.employeeId).name}
                                                <button
                                                  onClick={(e) => { e.stopPropagation(); removeVacation(v.id); }}
                                                  className="absolute top-0 right-1 text-white opacity-70 hover:opacity-100 text-sm"
                                                  aria-label="Eliminar vacaciones"
                                                >
                                                  &times;
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : null}
                        </div>
                    ))}
                </div>

                {selectStart && selectEnd && (
                    <div className="mt-4 p-4 rounded-lg bg-slate-700/50 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-md">
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-300 mb-1">Asignar a:</label>
                            <div className="relative w-full" ref={assignRef}>
                                <button
                                    className="w-full text-left p-2 rounded-lg bg-slate-800 border border-slate-600 text-white flex items-center justify-between shadow-inner"
                                    onClick={() => setAssignOpen(!assignOpen)}
                                >
                                    {employeeById(assignEmployeeId).name || "-- Elegir empleado --"}
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                                {assignOpen && (
                                    <div className="absolute z-10 w-full mt-2 rounded-lg bg-slate-800 border border-slate-600 shadow-xl max-h-48 overflow-y-auto">
                                        {employees.map((em) => (
                                            <div
                                                key={em.id}
                                                className="p-2 cursor-pointer hover:bg-slate-700/50 transition-colors flex items-center gap-2"
                                                onClick={() => {
                                                    setAssignEmployeeId(em.id);
                                                    setAssignOpen(false);
                                                }}
                                            >
                                                <div className="w-3 h-3 rounded-full" style={{ background: em.color }} />
                                                <div className="text-sm">{em.name}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex-shrink-0 flex gap-2">
                            <button
                                onClick={tryAssign}
                                className="px-4 py-2 rounded-lg bg-green-500 hover:bg-green-600 transition-colors text-white font-bold shadow-md hover:shadow-lg transition-transform hover:scale-105"
                            >
                                Asignar
                            </button>
                            <button
                                onClick={clearSelection}
                                className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 transition-colors text-white font-bold shadow-md hover:shadow-lg transition-transform hover:scale-105"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
        <div className="absolute bottom-4 right-4 text-xs text-gray-500">
            ID de usuario: {userId || "Desconocido"}
        </div>
    </div>
  );
}

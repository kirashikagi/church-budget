import React, { useState, useEffect } from 'react';
import {
 PlusCircle, Wallet, TrendingUp, TrendingDown, Trash2, PieChart,
 Printer, Users, UserPlus, LayoutDashboard, LogIn, LogOut, FileText, Menu, X
} from 'lucide-react';

// Импорты Firebase
import { db, auth, googleProvider } from './firebase';
import {
 collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp
} from 'firebase/firestore';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';

const App = () => {
 // --- STATE ---
 const [user, setUser] = useState(null);
 const [activeTab, setActiveTab] = useState('dashboard');
 const [loading, setLoading] = useState(true);
 const [isMenuOpen, setIsMenuOpen] = useState(false);

 // Данные из Firebase
 const [members, setMembers] = useState([]);
 const [transactions, setTransactions] = useState([]);

 // Формы
 const [form, setForm] = useState({
   type: 'income',
   category: 'Десятина',
   amount: '',
   description: '',
   date: new Date().toISOString().split('T')[0],
   memberId: ''
 });
 const [newMemberName, setNewMemberName] = useState('');

 // Списки категорий
 const incomeCategories = ['Десятина', 'Пожертвования', 'Обеты', 'Другие'];
 const expenseCategories = ['Аренда', 'Десятина в союз', 'Благословения', 'Мероприятия', 'Хозяйственные нужды'];

 // --- FIREBASE LISTENERS ---
 useEffect(() => {
   const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
     setUser(currentUser);
     setLoading(false);
   });
   return () => unsubscribeAuth();
 }, []);

 useEffect(() => {
   if (!user) return;

   // Слушаем транзакции
   const qTrans = query(collection(db, "transactions"), orderBy("date", "desc"));
   const unsubTrans = onSnapshot(qTrans, (snapshot) => {
     const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
     setTransactions(data);
   });

   // Слушаем участников
   const qMembers = query(collection(db, "members"), orderBy("name", "asc"));
   const unsubMembers = onSnapshot(qMembers, (snapshot) => {
     const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
     setMembers(data);
   });

   return () => {
     unsubTrans();
     unsubMembers();
   };
 }, [user]);

 // --- HANDLERS ---
 const handleLogin = async () => {
   try {
     await signInWithPopup(auth, googleProvider);
   } catch (error) {
     alert("Ошибка входа: " + error.message);
   }
 };

 const handleLogout = () => signOut(auth);

 const handleAddTransaction = async (e) => {
   e.preventDefault();
   if (!form.amount || !form.description) return;

   await addDoc(collection(db, "transactions"), {
     type: form.type,
     category: form.category,
     amount: parseFloat(form.amount),
     description: form.description,
     date: form.date,
     memberId: form.memberId || null,
     createdAt: serverTimestamp(),
     createdBy: user.email
   });

   setForm({ ...form, amount: '', description: '' });
 };

 const handleAddMember = async (e) => {
   e.preventDefault();
   if (!newMemberName.trim()) return;

   await addDoc(collection(db, "members"), {
     name: newMemberName.trim(),
     createdAt: serverTimestamp()
   });
   setNewMemberName('');
 };

 const deleteTransaction = async (id) => {
   if (window.confirm('Удалить эту запись из истории?')) {
     await deleteDoc(doc(db, "transactions", id));
   }
 };

 // Удаление человека
 const deleteMember = async (id, name) => {
   if (window.confirm(`Вы уверены, что хотите удалить ${name} из списка?`)) {
     await deleteDoc(doc(db, "members", id));
   }
 };

 // --- CALCULATIONS ---
 const totalIncome = transactions
   .filter(t => t.type === 'income')
   .reduce((acc, curr) => acc + curr.amount, 0);

 const totalExpense = transactions
   .filter(t => t.type === 'expense')
   .reduce((acc, curr) => acc + curr.amount, 0);

 const balance = totalIncome - totalExpense;

 const expenseBreakdown = transactions
   .filter(t => t.type === 'expense')
   .reduce((acc, curr) => {
     acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
     return acc;
   }, {});

 const sortedExpenses = Object.entries(expenseBreakdown)
   .sort(([,a], [,b]) => b - a);

 // Member Stats Logic
 const getMemberStats = () => {
   return members.map(member => {
     const memberTrans = transactions.filter(t => t.memberId === member.id && t.type === 'income');
     const tithe = memberTrans.filter(t => t.category === 'Десятина').reduce((sum, t) => sum + t.amount, 0);
     const offering = memberTrans.filter(t => t.category === 'Пожертвования').reduce((sum, t) => sum + t.amount, 0);
     const vow = memberTrans.filter(t => t.category === 'Обеты').reduce((sum, t) => sum + t.amount, 0);
     const total = tithe + offering + vow + memberTrans.filter(t => t.category === 'Другие').reduce((sum, t) => sum + t.amount, 0);
     
     return { ...member, tithe, offering, vow, total };
   }).sort((a, b) => b.total - a.total);
 };

 // --- FULL REPORT GENERATOR ---
 const downloadFullReport = () => {
   const date = new Date().toLocaleDateString('ru-RU');
   let report = `=== ПОЛНЫЙ ОТЧЕТ БЮДЖЕТА ===\nДата: ${date}\nСформировал: ${user.email}\n\n`;
   report += `БАЛАНС: ${balance.toLocaleString()} ₽\nПриход: ${totalIncome.toLocaleString()} ₽\nРасход: ${totalExpense.toLocaleString()} ₽\n\n`;
   
   report += `--- РАСХОДЫ ---\n`;
   sortedExpenses.forEach(([cat, amt]) => {
     const percent = totalExpense > 0 ? ((amt / totalExpense) * 100).toFixed(1) : 0;
     report += `${cat}: ${amt.toLocaleString()} ₽ (${percent}%)\n`;
   });
   report += `\n--- ЛЮДИ (Даяния) ---\n`;
   const memberStats = getMemberStats();
   memberStats.forEach(m => report += `${m.name}: ${m.total} ₽ (Дес: ${m.tithe}, Жертв: ${m.offering}, Обет: ${m.vow})\n`);
   report += `\n--- ЖУРНАЛ ---\n`;
   transactions.forEach(t => {
       const sign = t.type === 'income' ? '+' : '-';
       report += `[${t.date}] ${sign}${t.amount} | ${t.category} | ${t.description}\n`;
   });

   const element = document.createElement("a");
   const file = new Blob([report], {type: 'text/plain'});
   element.href = URL.createObjectURL(file);
   element.download = `Budget_Full_${new Date().toISOString().split('T')[0]}.txt`;
   document.body.appendChild(element);
   element.click();
   document.body.removeChild(element);
 };

 // --- LOGIN SCREEN ---
 if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500">Загрузка системы...</div>;
 
 if (!user) {
   return (
     <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 p-6">
       <div className="max-w-md w-full bg-white p-10 rounded-2xl shadow-xl text-center border border-slate-200">
         <div className="bg-slate-900 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
           <Wallet className="w-10 h-10 text-white" />
         </div>
         <h1 className="text-3xl font-bold mb-2 text-slate-800">Бюджет Церкви</h1>
         <p className="text-slate-500 mb-8 text-lg">Управление ресурсами Царства</p>
         <button onClick={handleLogin} className="w-full flex items-center justify-center gap-3 bg-emerald-600 text-white py-4 px-6 rounded-xl hover:bg-emerald-700 transition-all font-semibold text-lg shadow-md active:scale-95">
           <LogIn className="w-6 h-6" /> Войти в систему
         </button>
       </div>
     </div>
   );
 }

 // --- APP INTERFACE ---
 return (
   <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-20 print:bg-white print:pb-0">
     <style>{`@media print {.no-print { display: none !important; }}`}</style>

     {/* FLOATING HEADER */}
     <div className="sticky top-2 z-50 mx-3 mt-3 bg-white/95 backdrop-blur-sm border border-slate-200/60 shadow-lg rounded-2xl px-4 py-3 flex justify-between items-center no-print">
        <div className="flex items-center gap-3">
           <div className={`p-2 rounded-xl ${balance >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
               <Wallet className="w-6 h-6" />
           </div>
           <div>
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Баланс</p>
               <p className="text-xl font-black leading-none tracking-tight">{balance.toLocaleString()} ₽</p>
           </div>
        </div>
        <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2.5 bg-slate-100 rounded-xl md:hidden active:scale-95 transition-transform">
           {isMenuOpen ? <X className="w-6 h-6"/> : <Menu className="w-6 h-6"/>}
        </button>

        {/* Desktop Nav */}
        <div className="hidden md:flex gap-2">
           <NavButtons activeTab={activeTab} setActiveTab={setActiveTab} downloadFullReport={downloadFullReport} handleLogout={handleLogout} />
        </div>
     </div>

     {/* Mobile Menu */}
     {isMenuOpen && (
       <div className="md:hidden fixed inset-x-3 top-20 bg-white border border-slate-200 rounded-2xl p-2 space-y-1 shadow-2xl z-40 no-print animate-in slide-in-from-top-4 fade-in duration-200">
           <NavButtons activeTab={activeTab} setActiveTab={(tab) => {setActiveTab(tab); setIsMenuOpen(false)}} downloadFullReport={downloadFullReport} handleLogout={handleLogout} mobile />
       </div>
     )}

     {/* MAIN CONTAINER */}
     <div className="w-full max-w-7xl mx-auto px-2 md:px-4 py-4 space-y-6">
       
       {/* --- DASHBOARD TAB --- */}
       {activeTab === 'dashboard' && (
         <>
           {/* KPI Cards */}
           <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
             <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
               <p className="text-slate-400 text-xs font-medium mb-1">Приход</p>
               <p className="text-lg font-bold text-slate-900">{totalIncome.toLocaleString()}</p>
               <TrendingUp className="w-4 h-4 text-emerald-500 mt-2" />
             </div>
             <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
               <p className="text-slate-400 text-xs font-medium mb-1">Расход</p>
               <p className="text-lg font-bold text-slate-900">{totalExpense.toLocaleString()}</p>
               <TrendingDown className="w-4 h-4 text-orange-500 mt-2" />
             </div>
             <div className="bg-slate-900 p-4 rounded-2xl shadow-sm text-white col-span-2">
               <p className="text-slate-400 text-xs font-medium mb-1">Маржа</p>
               <p className="text-2xl font-bold">
                 {totalIncome > 0 ? ((balance / totalIncome) * 100).toFixed(1) : 0}%
               </p>
             </div>
           </div>

           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
             <div className="lg:col-span-2 space-y-6">
               
               {/* Transaction Form */}
               <div className="bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-slate-200 no-print">
                 <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-lg"><PlusCircle className="w-5 h-5 text-blue-600" /> Добавить</h3>
                 <form onSubmit={handleAddTransaction} className="space-y-4">
                   <div className="flex bg-slate-100 p-1 rounded-xl">
                       <button type="button" onClick={() => setForm({...form, type: 'income'})} className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${form.type === 'income' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}>Приход (+)</button>
                       <button type="button" onClick={() => setForm({...form, type: 'expense', memberId: ''})} className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${form.type === 'expense' ? 'bg-white text-orange-700 shadow-sm' : 'text-slate-500'}`}>Расход (-)</button>
                   </div>

                   <div className="grid grid-cols-2 gap-3">
                       <input type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className="w-full bg-slate-50 border-slate-200 rounded-xl p-3 text-lg font-semibold placeholder:text-slate-300" placeholder="0 ₽" />
                       <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="w-full bg-slate-50 border-slate-200 rounded-xl p-3 font-medium text-slate-600" />
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full bg-slate-50 border-slate-200 rounded-xl p-3 h-12 font-medium">
                           {(form.type === 'income' ? incomeCategories : expenseCategories).map(c => <option key={c} value={c}>{c}</option>)}
                       </select>
                       <select disabled={form.type === 'expense'} value={form.memberId} onChange={e => setForm({...form, memberId: e.target.value})} className="w-full bg-slate-50 border-slate-200 rounded-xl p-3 disabled:opacity-50 h-12 font-medium">
                           <option value="">-- Анонимно --</option>
                           {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                       </select>
                   </div>

                   <input type="text" value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="w-full bg-slate-50 border-slate-200 rounded-xl p-3 placeholder:text-slate-300" placeholder="Описание операции" />
                   
                   <button type="submit" className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:bg-slate-800 active:scale-95 transition-all">
                       Сохранить
                   </button>
                 </form>
               </div>

               {/* List */}
               <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-5 bg-white border-b border-slate-100 font-bold text-slate-800 text-lg">Лента операций</div>
                  <div className="divide-y divide-slate-100">
                   {transactions.length === 0 ? <div className="p-8 text-center text-slate-400">История пуста</div> : transactions.map(t => (
                       <div key={t.id} className="p-4 flex justify-between items-start gap-3 hover:bg-slate-50 transition-colors">
                           <div className="flex-1">
                               <div className="flex justify-between items-center mb-1">
                                   <span className="font-bold text-slate-800">{t.category}</span>
                                   <span className={`font-black text-base ${t.type === 'income' ? 'text-emerald-600' : 'text-slate-900'}`}>
                                       {t.type === 'income' ? '+' : '-'}{t.amount.toLocaleString()}
                                   </span>
                               </div>
                               <div className="text-sm text-slate-500 font-medium leading-snug">{t.description}</div>
                               <div className="text-xs text-slate-400 mt-2 flex items-center gap-2 font-medium">
                                   <span>{new Date(t.date).toLocaleDateString()}</span>
                                   {t.memberId && members.find(m => m.id === t.memberId) && (
                                       <span className="bg-slate-100 px-2 py-0.5 rounded-full text-slate-600 text-[10px] uppercase tracking-wide">
                                           {members.find(m => m.id === t.memberId).name}
                                       </span>
                                   )}
                               </div>
                           </div>
                           <button onClick={() => deleteTransaction(t.id)} className="text-slate-300 hover:text-red-500 p-2 no-print active:scale-90 transition-transform"><Trash2 className="w-5 h-5"/></button>
                       </div>
                   ))}
                  </div>
               </div>
             </div>

             {/* Sidebar Stats */}
             <div className="space-y-6">
                <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200">
                   <h3 className="font-bold text-slate-800 mb-4">Структура расходов</h3>
                   <div className="space-y-4">
                       {sortedExpenses.map(([cat, amt]) => (
                            <div key={cat}>
                               <div className="flex justify-between text-sm mb-1.5 font-medium"><span className="text-slate-600">{cat}</span><span className="text-slate-900">{amt.toLocaleString()}</span></div>
                               <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden"><div className="bg-orange-500 h-2.5 rounded-full" style={{width: `${(amt/totalExpense)*100}%`}}></div></div>
                            </div>
                       ))}
                   </div>
                </div>
             </div>
           </div>
         </>
       )}

       {/* --- PEOPLE TAB --- */}
       {activeTab === 'people' && (
         <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden min-h-[50vh]">
            <div className="p-4 border-b border-slate-100 bg-white flex justify-between items-center no-print sticky top-0 z-10">
               <h3 className="font-bold text-lg text-slate-800">Люди</h3>
               <form onSubmit={handleAddMember} className="flex gap-2 w-1/2 justify-end">
                   <input type="text" value={newMemberName} onChange={e => setNewMemberName(e.target.value)} placeholder="Имя" className="border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:border-blue-500" />
                   <button type="submit" className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 active:scale-95 transition-transform"><PlusCircle className="w-5 h-5"/></button>
               </form>
            </div>
           
            {/* ОБНОВЛЕННАЯ ТАБЛИЦА */}
            <div className="overflow-x-auto">
               <table className="w-full text-sm text-left">
                   <thead className="bg-slate-50 text-slate-500 font-semibold uppercase text-xs tracking-wider">
                       <tr>
                           <th className="p-4">Имя</th>
                           <th className="p-4 text-right">Десятина</th>
                           <th className="p-4 text-right">Жертвы</th>
                           <th className="p-4 text-right">Обеты</th>
                           <th className="p-4 text-right">Всего</th>
                           <th className="p-4 w-10"></th>
                       </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                       {getMemberStats().map(m => (
                           <tr key={m.id} className="group hover:bg-slate-50 transition-colors">
                               <td className="p-4 font-bold text-slate-800">{m.name}</td>
                               <td className="p-4 text-right text-emerald-600 font-medium">{m.tithe > 0 ? m.tithe.toLocaleString() : '-'}</td>
                               <td className="p-4 text-right text-blue-600 font-medium">{m.offering > 0 ? m.offering.toLocaleString() : '-'}</td>
                               <td className="p-4 text-right text-purple-600 font-medium">{m.vow > 0 ? m.vow.toLocaleString() : '-'}</td>
                               <td className="p-4 text-right font-black text-slate-900">{m.total.toLocaleString()}</td>
                               <td className="p-4 text-right">
                                   <button
                                       onClick={() => deleteMember(m.id, m.name)}
                                       className="text-slate-300 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                                       title="Удалить"
                                   >
                                       <Trash2 className="w-4 h-4" />
                                   </button>
                               </td>
                           </tr>
                       ))}
                   </tbody>
               </table>
            </div>
         </div>
       )}
     </div>
   </div>
 );
};

// Sub-component for Menu Buttons
const NavButtons = ({activeTab, setActiveTab, downloadFullReport, handleLogout, mobile}) => {
   const baseClass = mobile ? "w-full justify-start py-3 px-4 text-base font-medium rounded-xl hover:bg-slate-50" : "text-sm px-3 py-2";
   return (
       <>
           <button onClick={() => setActiveTab('dashboard')} className={`flex items-center gap-2 rounded-xl transition-all ${baseClass} ${activeTab === 'dashboard' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}>
               <LayoutDashboard className="w-4 h-4" /> Обзор
           </button>
           <button onClick={() => setActiveTab('people')} className={`flex items-center gap-2 rounded-xl transition-all ${baseClass} ${activeTab === 'people' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}>
               <Users className="w-4 h-4" /> Люди
           </button>
           <div className={`h-px bg-slate-100 my-1 ${!mobile && 'hidden'}`}></div>
           <button onClick={downloadFullReport} className={`flex items-center gap-2 text-emerald-700 hover:bg-emerald-50 rounded-xl transition-all ${baseClass}`}>
               <FileText className="w-4 h-4" /> Отчет
           </button>
           <button onClick={handleLogout} className={`flex items-center gap-2 text-red-600 hover:bg-red-50 rounded-xl transition-all ${baseClass}`}>
               <LogOut className="w-4 h-4" /> Выйти
           </button>
       </>
   )
}

export default App;
//  const dataQuery = `
//  {
//     documents {
//        cv(chapterVerses:"1:1-1") {
//         items {
//             payload(includeChars: ["attribute/milestone/zaln/x-strong"])
//         }
//        }
//     }
//  }
//  `;



// const dataQuery = `
// {
//    documents {
//       cv(chapterVerses:"1:1") {
//        items {
//            scopes(startsWith: ["attribute/milestone/zaln/x-strong"])
//        }
//        text
//        includedScopes
//       }
//    }
// }
// `;



// const dataQuery = `
// {
//    documents {
//       cv(chapterVerses:"1:1") {
//        text
//        includedScopes
//       }
//    }
// }
// `;


// const dataQuery = `
// {
//     documents {
//         cv(chapterVerses: "1:1", includeContext: true) {
//             items(filter: { type: { eq: "scope" }, subType: { eq: "start" } }) {
//                 type
//                 subType
//                 payload(includeChars: ["strongs"])
//             }
//         }
//     }
// }
// `;